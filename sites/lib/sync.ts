import {all,one,run,batch,database} from '@/db/raw';
import {accessToken} from './google-connection';
import {normalizeEvent,type GoogleEvent} from './domain';
import {ProofError} from './google-proof';
import {SYNC_FRESHNESS_MS} from './live-policy';
export type CalendarRow={owner:string;id:string;name:string;closer:string;team_status:string;selected:number;sync_token:string|null;page_token:string|null;generation:string|null;mode:string|null;last_sync:string|null;error:string|null;lease_until:number;coverage_from:string|null;coverage_to:string|null};
export async function syncStep(owner:string,calendarId?:string){
 const calendars=await all<CalendarRow>('SELECT * FROM calendars WHERE owner=? AND selected=1 ORDER BY COALESCE(last_sync,\'\'), id',owner);
 if(!calendars.length)throw new ProofError(422,'no_calendars','Selecione pelo menos uma agenda nas configurações.');
 const available=calendars.find(c=>(!calendarId||c.id===calendarId)&&c.lease_until<Date.now());if(!available)return {status:'busy',pending:true,message:'Uma sincronização já está em andamento.'};
 const c=available,lease=crypto.randomUUID();const locked=await run('UPDATE calendars SET lease=?,lease_until=? WHERE owner=? AND id=? AND lease_until<?',lease,Date.now()+120000,owner,c.id,Date.now());if(!locked.meta.changes)return {status:'busy',pending:true};
 try{
 const token=await accessToken(owner);const renewWindow=!c.page_token&&c.coverage_to&&Date.parse(c.coverage_to)<Date.now()+365*86400000;const pageSize=c.mode?.endsWith(':2500')||(!c.mode&&!c.sync_token&&!c.page_token)?2500:250;let mode=c.page_token?(c.mode||'full'):`${c.sync_token&&!renewWindow?'incremental':'full'}${pageSize===2500?':2500':''}`;let generation=c.generation||crypto.randomUUID();let page=c.page_token;
 const from=c.coverage_from||'2020-01-01T00:00:00-03:00';const to=(!renewWindow&&c.coverage_to)||new Date(Date.now()+730*86400000).toISOString();
 // Each page is a transaction. Only the final page advances the sync cursor.
 const u=new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events`);
 u.searchParams.set('maxResults',String(pageSize));u.searchParams.set('singleEvents','true');u.searchParams.set('showDeleted','true');
 if(mode.startsWith('incremental'))u.searchParams.set('syncToken',c.sync_token!);else {u.searchParams.set('timeMin',from);u.searchParams.set('timeMax',to)}
 if(page)u.searchParams.set('pageToken',page);
 const response=await fetch(u,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
 if(response.status===410){await run("UPDATE calendars SET sync_token=NULL,page_token=NULL,generation=NULL,mode=NULL,error=NULL WHERE owner=? AND id=? AND lease=?",owner,c.id,lease);return {status:'reset',pending:true,calendar:c.name,message:'Reconstruindo a leitura após expiração do cursor.'};}
 if(!response.ok){const code=response.status===401?'reconnect_required':'google_unavailable';if(response.status===401)await run("UPDATE google_connections SET expires=0 WHERE owner=?",owner);throw new ProofError(response.status===401?409:502,code,`Não foi possível sincronizar ${c.name} (Google ${response.status}). Os registros anteriores foram preservados.`)}
 const data=await response.json() as {items?:GoogleEvent[];nextPageToken?:string;nextSyncToken?:string};if(data.items!==undefined&&!Array.isArray(data.items))throw new Error('Malformed sync');
 const statements:D1PreparedStatement[]=[];
 const ids=(data.items||[]).map(e=>e.id).filter(Boolean);const previous=new Map<string,{google_id:string;canonical_id:string;starts_at:string}>();
 for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50);const found=await all<{google_id:string;canonical_id:string;starts_at:string}>(`SELECT google_id,canonical_id,starts_at FROM google_events WHERE owner=? AND calendar_id=? AND google_id IN (${chunk.map(()=>'?').join(',')})`,owner,c.id,...chunk);found.forEach(e=>previous.set(e.google_id,e))}

 const normalized=await Promise.all((data.items||[]).map(e=>e.status==='cancelled'&&!e.start?null:normalizeEvent(e,c.id)));
 for(const [index,e] of (data.items||[]).entries()){if(!e.id)continue;if(e.status==='cancelled'&&!e.start){statements.push(database().prepare('UPDATE google_events SET deleted=1,generation=? WHERE owner=? AND calendar_id=? AND google_id=?').bind(generation,owner,c.id,e.id));continue}
 const n=normalized[index]!;
 const old=previous.get(e.id);if(old&&old.starts_at&&n.start&&Date.parse(old.starts_at)!==Date.parse(n.start)&&n.kind==='consultoria')statements.push(database().prepare("INSERT INTO operational_history(id,owner,consultation_id,at,action,value,request_id) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,request_id) DO NOTHING").bind(crypto.randomUUID(),owner,n.id,new Date().toISOString(),'rescheduled',`${old.starts_at} → ${n.start}`,`google:${c.id}:${e.id}:${e.updated||n.start}`));

 statements.push(database().prepare('INSERT INTO google_events(owner,calendar_id,google_id,canonical_id,generation,deleted,title,name,phone,created_at,starts_at,ends_at,date,kind,qualified,blocking,raw) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,calendar_id,google_id) DO UPDATE SET canonical_id=excluded.canonical_id,generation=excluded.generation,deleted=excluded.deleted,title=excluded.title,name=excluded.name,phone=excluded.phone,created_at=excluded.created_at,starts_at=excluded.starts_at,ends_at=excluded.ends_at,date=excluded.date,kind=excluded.kind,qualified=excluded.qualified,blocking=excluded.blocking,raw=excluded.raw').bind(owner,c.id,e.id,n.id,generation,e.status==='cancelled'?1:0,n.title,n.name,n.phone,e.created||null,n.start,n.end,n.date,n.kind,n.qualified,n.blocking,JSON.stringify(e)));
 }
 await batch(statements);
 if(data.nextPageToken){await run('UPDATE calendars SET page_token=?,generation=?,mode=?,coverage_from=?,coverage_to=?,error=NULL WHERE owner=? AND id=? AND lease=?',data.nextPageToken,generation,mode,from,to,owner,c.id,lease);return {status:'page',pending:true,calendar:c.name,events:data.items?.length||0}}
 if(!data.nextSyncToken)throw new Error('Missing complete sync token');
 const finish=[];
 if(mode.startsWith('full'))finish.push(database().prepare('UPDATE google_events SET deleted=1 WHERE owner=? AND calendar_id=? AND generation<>? AND julianday(starts_at)>=julianday(?) AND julianday(starts_at)<julianday(?)').bind(owner,c.id,generation,from,to));
 finish.push(database().prepare('UPDATE calendars SET sync_token=?,page_token=NULL,generation=NULL,mode=?,last_sync=?,coverage_from=?,coverage_to=?,error=NULL WHERE owner=? AND id=? AND lease=?').bind(data.nextSyncToken,pageSize===2500?'incremental:2500':null,new Date().toISOString(),from,to,owner,c.id,lease));
 await database().batch(finish);
 const remaining=calendars.some(x=>x.id!==c.id&&(!x.last_sync||x.page_token||Date.parse(x.last_sync)<Date.now()-SYNC_FRESHNESS_MS));
 return {status:'success',pending:remaining,calendar:c.name,events:data.items?.length||0};
 }catch(error){await run('UPDATE calendars SET error=? WHERE owner=? AND id=? AND lease=?',error instanceof ProofError?error.message:'A sincronização falhou. Tente novamente.',owner,c.id,lease);throw error}finally{await run('UPDATE calendars SET lease_until=0,lease=NULL WHERE owner=? AND id=? AND lease=?',owner,c.id,lease)}
}

// Bound concurrency to three distinct calendar leases; each keeps its own cursor.
export async function syncRound(owner:string){
 const targets=await all<{id:string}>("SELECT id FROM calendars WHERE owner=? AND selected=1 AND lease_until<? AND (last_sync IS NULL OR page_token IS NOT NULL OR last_sync<?) ORDER BY COALESCE(last_sync,''),id LIMIT 3",owner,Date.now(),new Date(Date.now()-SYNC_FRESHNESS_MS).toISOString());
 if(!targets.length)return {status:'fresh',pending:false,events:0,results:[]};
 const settled=await Promise.allSettled(targets.map(c=>syncStep(owner,c.id)));
 const results=settled.map(r=>r.status==='fulfilled'?r.value:{status:'error',pending:true,message:r.reason instanceof ProofError?r.reason.message:'Não foi possível atualizar esta agenda. Os dados salvos foram preservados.'});
 if(settled.every(r=>r.status==='rejected'))throw (settled[0] as PromiseRejectedResult).reason;
 const remaining=await one<{n:number}>("SELECT COUNT(*) n FROM calendars WHERE owner=? AND selected=1 AND (last_sync IS NULL OR page_token IS NOT NULL OR last_sync<? OR error IS NOT NULL)",owner,new Date(Date.now()-SYNC_FRESHNESS_MS).toISOString());
 return {status:results.some(r=>r.status==='error')?'partial':results.every(r=>r.status==='busy')?'busy':'success',pending:Boolean(remaining?.n),events:results.reduce((n,r)=>n+('events' in r?Number(r.events):0),0),results};
}
