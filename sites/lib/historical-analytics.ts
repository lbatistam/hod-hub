import {DateTime} from 'luxon';
import {configuredClosers} from './rules/closers';
import {isConsultoriaTitle} from './rules/calendar-rules';
import type {GoogleEvent} from './domain';
export type HistoricalSource={canonical_id:string;calendar_id:string;raw:string;created_at:string;starts_at:string;deleted:number};
export type HistoricalBooking={id:string;closer:string;color:string;date:string;created:string;time:string;former:boolean;creationRecord:boolean;attribution:'verified'|'review';cancelled:boolean};
export type HistoricalAnalytics={records:HistoricalBooking[];coverage:{accounts:string[];from:string;until:string;complete:boolean;personalConnected:boolean;review:number;withoutCreated:number;excludedOtherAuthors:number;excludedInternal:number;cancelled:number;sourceCopies:number;uniqueEvents:number}};
const internal=/\b(daily|weekly|alinhamento|reuni[aã]o interna|treinamento.*crm|comercial.*sdr|sdr.*comercial)\b/i;
export function historicalAnalytics(sources:HistoricalSource[],accounts:string[],complete:boolean,until:string):HistoricalAnalytics{
 const own=new Set(accounts.map(x=>x.toLowerCase()));
 const roster=new Map(configuredClosers.filter(c=>!['reuniao@metodohod.com','alvaro@metodohod.com'].includes(c.calendar)).map(c=>[c.calendar,c]));
 const groups=new Map<string,HistoricalSource[]>();for(const s of sources){const list=groups.get(s.canonical_id)||[];list.push(s);groups.set(s.canonical_id,list)}
 const coverage={accounts,from:'2026-01-01',until,complete,personalConnected:accounts.some(a=>a.endsWith('@gmail.com')),review:0,withoutCreated:0,excludedOtherAuthors:0,excludedInternal:0,cancelled:0,sourceCopies:sources.length,uniqueEvents:groups.size};const records:HistoricalBooking[]=[];
 for(const [id,copies] of groups){const ordered=[...copies].sort((a,b)=>a.deleted-b.deleted||a.calendar_id.localeCompare(b.calendar_id));const primary=ordered.find(s=>own.has(s.calendar_id.toLowerCase()))||ordered[0];let e:GoogleEvent;try{e=JSON.parse(primary.raw)}catch{continue}
 const allEvents=ordered.map(s=>{try{return JSON.parse(s.raw) as GoogleEvent}catch{return null}}).filter((x):x is GoogleEvent=>Boolean(x));
 const hosted=allEvents.some(x=>own.has((x.organizer?.email||'').toLowerCase())||own.has((x.creator?.email||'').toLowerCase()));
 if(!hosted){coverage.excludedOtherAuthors++;continue}
 const title=e.summary||'';if(internal.test(title)){coverage.excludedInternal++;continue}
 const participants=[...new Set((e.attendees||[]).map(a=>(a.email||'').toLowerCase()))];
 let candidates=participants.filter(a=>roster.has(a));if(candidates.length>1)candidates=candidates.filter(a=>a!=='rafael@metodohod.com');
 const external=participants.some(a=>a&&!own.has(a)&&!a.endsWith('@metodohod.com')&&!roster.has(a));
 // Nonstandard titles require verifiable host + closer + lead contact. Internal team meetings cannot become bookings.
 const leadContact=external||/(?:\+?55\s*)?\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]*\d{4}\b/.test(e.description||'');
 if(!isConsultoriaTitle(title)&&!(candidates.length&&leadContact))continue;
 const start=e.start?.dateTime||e.start?.date||primary.starts_at;const date=DateTime.fromISO(start,{zone:'America/Sao_Paulo'}).toISODate();if(!date)continue;
 const createdAt=allEvents.map(x=>x.created||'').filter(Boolean).sort()[0]||copies.map(s=>s.created_at||'').filter(Boolean).sort()[0]||'';
 const created=createdAt?DateTime.fromISO(createdAt,{zone:'America/Sao_Paulo'}).toISODate()||'':'';
 // Keep future meetings created within the career interval. UI explicitly chooses creation or meeting date.
 if((created||date)<'2026-01-01'||(created||date)>until)continue;
 const closer=candidates.length===1?roster.get(candidates[0])!:null;const attribution=closer?'verified':'review';if(!closer)coverage.review++;if(!created)coverage.withoutCreated++;
 const cancelled=copies.every(s=>Boolean(s.deleted));if(cancelled)coverage.cancelled++;
 records.push({id,closer:closer?.name||'Atribuição em revisão',color:closer?.color||'',date,created,time:DateTime.fromISO(start,{zone:'America/Sao_Paulo'}).toFormat('HH:mm'),former:closer?.teamStatus==='former',creationRecord:true,attribution,cancelled});
 }
 return {records,coverage};
}
