import {connectionAccounts} from './google-connection';
import {all,one} from '@/db/raw';
import {DateTime} from 'luxon';
import {classifyCalendar,clean,safeMeet,zone,type GoogleEvent} from './domain';
import type {Consultation,OperationalState} from './demo';
import type {CalendarRow} from './sync';
import {classifyLeadHistory} from './lead-classification';
import {attendanceFromGoogle} from './rules/calendar-rules';
import {extractConsultoriaLead} from './rules/calendar-rules';
import {buildDailySummary} from './daily-summary';
import {historicalAnalytics,type HistoricalSource} from './historical-analytics';
type EventRow={canonical_id:string;calendar_id:string;raw:string;name:string;phone:string;created_at:string;starts_at:string;ends_at:string;date:string;kind:string;qualified:number;deleted:number};
type Operational={id:string;status:OperationalState|null;note:string;revision:number};
export async function hubData(owner:string,date:string){
 const calendars=await all<CalendarRow>('SELECT * FROM calendars WHERE owner=? ORDER BY closer',owner);
 const conn=await one<{status:string;tokens:string}>('SELECT status,tokens FROM google_connections WHERE owner=?',owner);
 const prefs=await one<{json:string}>('SELECT json FROM preferences WHERE owner=?',owner);
 // Only consultation and SDR sales meetings enter the operational read model. All blocking events remain in the availability query.
 const sources=await all<EventRow>("SELECT e.* FROM google_events e JOIN calendars c ON c.owner=e.owner AND c.id=e.calendar_id WHERE e.owner=? AND e.kind IN ('consultoria','follow_up','sdr_meeting') ORDER BY e.created_at,e.canonical_id",owner);
 if(sources.length>30000)throw new Error('O volume excede o limite de leitura. É necessária paginação adicional.');
 const ops=await all<Operational>('SELECT * FROM operational WHERE owner=?',owner),opMap=new Map(ops.map(o=>[o.id,o]));
 const logs=await all<{consultation_id:string;at:string;action:string;value:string}>('SELECT consultation_id,at,action,value FROM operational_history WHERE owner=? ORDER BY at',owner);
 const historyMap=new Map<string,typeof logs>();for(const l of logs){const group=historyMap.get(l.consultation_id)||[];group.push(l);historyMap.set(l.consultation_id,group)}
 const unique=new Map<string,EventRow>();
 // Prefer a live closer copy over Rafael's invitation copy. A deleted closer copy does not prove current handoff.
 const priority=(r:EventRow)=>{const cal=calendars.find(c=>c.id===r.calendar_id),closer=classifyCalendar(r.calendar_id,cal?.name||'');return (r.deleted?0:100)+(closer.known&&closer.teamStatus!=='sdr'&&closer.role==='fixed'?20:closer.known?10:0)};
 for(const r of sources){const old=unique.get(r.canonical_id);if(!old||priority(r)>priority(old))unique.set(r.canonical_id,r)}
 const classification=classifyLeadHistory([...unique.values()].map(r=>{const e=JSON.parse(r.raw) as GoogleEvent;return {id:r.canonical_id,creationKey:e.iCalUID||r.canonical_id,name:r.name,createdAt:r.created_at,startsAt:r.starts_at,eligible:Boolean(extractConsultoriaLead(e.summary||'')?.match(/[A-Za-zÀ-ÿ]/))}}));
 const rows:Consultation[]=[];const now=Date.now();
 for(const r of [...unique.values()].filter(r=>!r.deleted).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||Date.parse(a.starts_at)-Date.parse(b.starts_at)||a.canonical_id.localeCompare(b.canonical_id))){const e=JSON.parse(r.raw) as GoogleEvent;const cal=calendars.find(c=>c.id===r.calendar_id);let closer=classifyCalendar(cal?.id||'',cal?.name||'Agenda');
 if(!closer.known){const match=[...(e.attendees||[]).map(a=>a.email),e.organizer?.email].find(email=>email&&classifyCalendar(email,email).known&&classifyCalendar(email,email).teamStatus!=='sdr');if(match)closer=classifyCalendar(match,match)}
 const eventLogs=historyMap.get(r.canonical_id)||[];const op=opMap.get(r.canonical_id);const start=Date.parse(r.starts_at),end=Date.parse(r.ends_at);if(!Number.isFinite(start)||!Number.isFinite(end))continue;
 const lead=classification.get(r.canonical_id)!;
 const over=closer.isOverbooking&&(!closer.overbookingFrom||r.date>=closer.overbookingFrom);
 const declined=attendanceFromGoogle(e,r.calendar_id).attendeeDeclined;
 const passedToCloser=Boolean(closer.known&&closer.role==='fixed'&& !['sdr','support','unknown'].includes(closer.teamStatus));
 const status=op?.status||(declined?'No-show':start<=now&&end>now?'Acontecendo':'Agendadas');
 const email=(e.attendees||[]).map(a=>a.email).find(v=>v&&!v.endsWith('@metodohod.com'))||clean(e.description).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||'';
 rows.push({id:r.canonical_id,name:r.name,phone:r.phone||'',email,time:DateTime.fromISO(r.starts_at,{zone}).toFormat('HH:mm'),duration:Math.max(1,Math.round((end-start)/60000)),closer:closer.name,color:closer.color,status,date:r.date,createdAt:r.created_at||'',rescheduled:lead.rescheduled,creationRecord:lead.creationRecord,qualified:lead.qualified,kind:r.kind,former:['former','sdr'].includes(closer.teamStatus),over,startsAt:r.starts_at,endsAt:r.ends_at,meetUrl:safeMeet(e),description:clean(e.description),googleStruck:declined,passedToCloser,attendanceRecorded:Boolean(op?.status==='Compareceu'||op?.status==='No-show'),revision:op?.revision||0,pending:end<now&&!op?.status&&!declined,note:op?.note||'',history:[{time:r.created_at||'Data indisponível',text:'Evento criado no Google Agenda'},...eventLogs.map(l=>({time:l.at,text:l.action==='status'?`Situação alterada para ${l.value}`:l.action==='rescheduled'?`Horário alterado no Google: ${l.value}`:'Observação atualizada'}))]});

 }
 const busy=await all<{calendar_id:string;starts_at:string;ends_at:string}>('SELECT calendar_id,starts_at,ends_at FROM google_events WHERE owner=? AND deleted=0 AND blocking=1 AND starts_at<? AND ends_at>?',owner,DateTime.fromISO(date,{zone}).plus({days:1}).toISO(),DateTime.fromISO(date,{zone}).toISO());
 const active=calendars.filter(c=>c.selected&&c.team_status==='active'&&classifyCalendar(c.id,c.name).role!=='overbooking');
 const availability=Array.from({length:15},(_,i)=>i+8).map(h=>{const start=DateTime.fromISO(`${date}T${String(h).padStart(2,'0')}:00`,{zone}),end=start.plus({hours:1});const reliable=active.filter(c=>c.last_sync&&!c.error&&Date.parse(c.coverage_from||'')<=start.toMillis()&&Date.parse(c.coverage_to||'')>=end.toMillis());const available=reliable.filter(c=>!busy.some(b=>b.calendar_id===c.id&&Date.parse(b.starts_at)<end.toMillis()&&Date.parse(b.ends_at)>start.toMillis()));return {h,reliable:reliable.map(c=>c.closer),start:start.toFormat('HH:mm'),end:end.toFormat('HH:mm'),available:available.map(c=>({name:c.closer})),capacity:reliable.length,occupied:reliable.length-available.length,unavailable:active.length-reliable.length}});
 const selected=calendars.filter(c=>c.selected||c.role==='owner');const complete=selected.length>0&&selected.every(c=>c.last_sync&&!c.error&&!c.page_token&&!c.generation);
 const dailySummary=buildDailySummary(rows,date,now,complete);
 const historical=await readHistoricalAnalytics(owner,calendars);
 const googleAccounts=await connectionAccounts(owner);
 return {googleAccounts,historicalAnalytics:historical,dailySummary,rows:rows.filter(c=>c.date===date||c.createdAt&&DateTime.fromISO(c.createdAt,{zone}).toISODate()===date),analyticsRecords:rows.filter(c=>c.kind==='consultoria'&&!c.over).map(c=>({id:c.id,closer:c.closer,color:c.color,date:c.date,created:c.createdAt?DateTime.fromISO(c.createdAt,{zone}).toISODate()||'':'',time:c.time,former:Boolean(c.former),creationRecord:Boolean(c.creationRecord)})),calendars:calendars.map(({sync_token,page_token,generation,lease_until,...c})=>({...c,syncing:Boolean(page_token||generation),lease:undefined,owner:undefined})),availability,preferences:prefs?JSON.parse(prefs.json):{},connection:googleAccounts.length?(googleAccounts.every(a=>a.status==='connected')?'connected':'partial'):conn?.status||'disconnected',historyCoverage:(calendars.some(c=>c.last_sync)?'Eventos acessíveis desde 01/01/2020 até dois anos à frente. Eventos excluídos antes da conexão e marcações do app local não são reconstruídos pelo Google. Novos leads são classificados somente dentro do histórico disponível.':'Importação ainda não concluída. Os totais não comprovam ausência de registros.'),readAt:new Date().toISOString(),source:'google_calendar_persisted'};
}

export async function readHistoricalAnalytics(owner:string,existingCalendars?:CalendarRow[]){
 const calendars=existingCalendars||await all<CalendarRow>('SELECT * FROM calendars WHERE owner=?',owner);
 // Never materialize full descriptions/attachments from every shared-calendar copy in a Worker.
 // Project only historical fields and bound the career interval before reading into memory.
 const connected=await connectionAccounts(owner);
 const personal=calendars.filter(c=>connected.length?connected.some(a=>a.account===c.id):c.role==='owner');
 const prefs=await one<{json:string}>('SELECT json FROM preferences WHERE owner=?',owner);
 const aliases=(prefs?JSON.parse(prefs.json).historicalAccounts:[])||[];
 const authors=[...new Set([...personal.map(c=>c.id),...aliases])].filter((x):x is string=>typeof x==='string');
 if(!authors.length)return historicalAnalytics([],[],false,DateTime.now().setZone(zone).toISODate()!);
 const placeholders=authors.map(()=>'?').join(',');
 const sources=await all<HistoricalSource>(`WITH candidates AS (
 SELECT e.*,ROW_NUMBER() OVER(PARTITION BY e.canonical_id ORDER BY e.deleted,CASE WHEN c.role='owner' THEN 0 ELSE 1 END,e.calendar_id) rn,
 MIN(NULLIF(e.created_at,'')) OVER(PARTITION BY e.canonical_id) first_created
 FROM google_events e JOIN calendars c ON c.owner=e.owner AND c.id=e.calendar_id
 WHERE e.owner=? AND (e.created_at>='2026-01-01T00:00:00-03:00' OR e.starts_at>='2026-01-01T00:00:00-03:00')
 AND (lower(json_extract(e.raw,'$.organizer.email')) IN (${placeholders}) OR lower(json_extract(e.raw,'$.creator.email')) IN (${placeholders})))
 SELECT canonical_id,calendar_id,first_created created_at,starts_at,deleted,
 json_object('summary',title,'created',first_created,'start',json_object('dateTime',starts_at),
 'organizer',json_object('email',json_extract(raw,'$.organizer.email')),
 'creator',json_object('email',json_extract(raw,'$.creator.email')),
 'attendees',json(COALESCE((SELECT json_group_array(json_object('email',json_extract(value,'$.email'))) FROM json_each(candidates.raw,'$.attendees')),'[]')),
 'description',substr(json_extract(raw,'$.description'),1,4000)) raw
 FROM candidates WHERE rn=1`,owner,...authors,...authors);
 return historicalAnalytics(sources,personal.map(c=>c.id),personal.length>0&&personal.every(c=>Boolean(c.last_sync&&!c.error&&!c.page_token&&!c.generation))&&connected.every(a=>a.status==='connected'),DateTime.now().setZone(zone).toISODate()!,aliases,(prefs?JSON.parse(prefs.json).historicalCloserAliases:[])||[],(prefs?JSON.parse(prefs.json).historicalCloserProposals:[])||[],(prefs?JSON.parse(prefs.json).historicalCloserAssignments:[])||[]);
}
