import {all,one} from '@/db/raw';
import {connectionAccounts,accessToken} from './google-connection';
import {googleList} from './google-proof';
import {DateTime} from 'luxon';
import type {GoogleEvent} from './domain';
export async function sourceAudit(owner:string,auditDate?:string){
 const connected=await connectionAccounts(owner),prefs=await one<{json:string}>('SELECT json FROM preferences WHERE owner=?',owner),aliases=(prefs?JSON.parse(prefs.json).historicalAccounts:[])||[];
 const accounts=[...new Set([...connected.map(a=>a.account),...aliases])];
 const calendars=await all('SELECT id,name,role,selected,last_sync,error,page_token IS NOT NULL paginating,coverage_from,coverage_to FROM calendars WHERE owner=?',owner);
 const monthly=await all("SELECT substr(date,1,7) month,COUNT(*) sourceCopies,COUNT(DISTINCT canonical_id) uniqueEvents,COUNT(DISTINCT CASE WHEN kind='consultoria' THEN canonical_id END) consultorias FROM google_events WHERE owner=? AND date>='2026-01-01' AND date<=date('now','-3 hours') GROUP BY month",owner);
 const samples=await all<{canonical_id:string;calendar_id:string;title:string;starts_at:string;raw:string}>("SELECT canonical_id,calendar_id,title,starts_at,raw FROM google_events WHERE owner=? AND date>='2026-08-01' AND date<=date('now','-3 hours') AND kind='consultoria' ORDER BY starts_at DESC LIMIT 100",owner);
 const rows=samples.map(e=>{const r=JSON.parse(e.raw);return {id:e.canonical_id,calendar:e.calendar_id,title:e.title,start:e.starts_at,organizer:r.organizer?.email,creator:r.creator?.email,description:(r.description||'').slice(0,2500),participants:(r.attendees||[]).map((a:{email:string})=>a.email),self:(r.attendees||[]).filter((a:{self:boolean})=>a.self).map((a:{email:string})=>a.email)}});
 let focusedAudit:unknown;
 if(auditDate&&/^\d{4}-\d{2}-\d{2}$/.test(auditDate)){
  const from=DateTime.fromISO(auditDate,{zone:'America/Sao_Paulo'}).startOf('month'),to=from.plus({months:1});
  if(!from.isValid)throw new Error('Invalid audit month');
  const stored=await all<{canonical_id:string;calendar_id:string;title:string;starts_at:string;created_at:string;date:string;deleted:number;raw:string}>("SELECT canonical_id,calendar_id,title,starts_at,created_at,date,deleted,raw FROM google_events WHERE owner=? AND ((date>=? AND date<?) OR (created_at>=? AND created_at<?)) ORDER BY starts_at,canonical_id,calendar_id",owner,from.toISODate(),to.toISODate(),from.toISO(),to.toISO());
  const records=stored.map(s=>{const e=JSON.parse(s.raw) as GoogleEvent;return {id:s.canonical_id,googleId:e.id,calendar:s.calendar_id,title:s.title,start:s.starts_at,created:s.created_at,deleted:s.deleted,organizer:e.organizer?.email,creator:e.creator?.email,participants:(e.attendees||[]).map(a=>({email:a.email,displayName:(a as {displayName?:string}).displayName})),description:(e.description||'').slice(0,4000)}});
  const live=[];
  for(const connection of connected){
   try{
    const token=await accessToken(owner,false,connection.account);
    const read=await googleList<GoogleEvent>(`calendars/${encodeURIComponent(connection.account)}/events`,token,{timeMin:'2026-01-01T00:00:00-03:00',timeMax:DateTime.now().setZone('America/Sao_Paulo').plus({days:1}).startOf('day').toISO()!,singleEvents:'true',showDeleted:'false',maxResults:'2500'});
    const monthEvents=read.items.filter(e=>{const start=e.start?.dateTime||e.start?.date||'';return DateTime.fromISO(start,{zone:'America/Sao_Paulo'}).toFormat('yyyy-MM')===from.toFormat('yyyy-MM')});
    const ids=new Set(stored.filter(e=>e.calendar_id===connection.account).map(e=>(JSON.parse(e.raw) as GoogleEvent).id));
    live.push({account:connection.account,status:'success',readAt:new Date().toISOString(),from:'2026-01-01',until:DateTime.now().setZone('America/Sao_Paulo').toISODate(),pages:read.pages,totalCareerEvents:read.items.length,byMeetingMonth:[...new Set(read.items.map(e=>DateTime.fromISO(e.start?.dateTime||e.start?.date||'',{zone:'America/Sao_Paulo'}).toFormat('yyyy-MM')))].sort().map(month=>({month,total:read.items.filter(e=>DateTime.fromISO(e.start?.dateTime||e.start?.date||'',{zone:'America/Sao_Paulo'}).toFormat('yyyy-MM')===month).length})),monthTotal:monthEvents.length,missingInStored:monthEvents.filter(e=>!ids.has(e.id)).map(e=>({id:e.id,title:e.summary})),monthEvents:monthEvents.map(e=>({id:e.id,title:e.summary,created:e.created,start:e.start,organizer:e.organizer?.email,creator:e.creator?.email,participants:(e.attendees||[]).map(a=>a.email),description:(e.description||'').slice(0,4000)}))});
   }catch(e){live.push({account:connection.account,status:'error',message:(e as Error).message})}
  }
  focusedAudit={month:from.toFormat('yyyy-MM'),live,records};
 }
 return {accounts,calendars,monthly,recentConsultorias:rows,...(focusedAudit?{focusedAudit}:{})};
}
