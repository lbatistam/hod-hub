import {DateTime} from 'luxon';
import {configuredClosers} from './rules/closers';
import {isConsultoriaTitle,extractConsultoriaLead} from './rules/calendar-rules';
import type {GoogleEvent} from './domain';
export type HistoricalSource={canonical_id:string;calendar_id:string;raw:string;created_at:string;starts_at:string;deleted:number};
export type CloserCredit={name:string;color:string;former:boolean;formerLabel:'Antigo membro'|'Antiga membra'|'Ex-Closer'};
export type HistoricalBooking={credits?:CloserCredit[];id:string;name:string;createdAt:string;startsAt:string;participants:string[];reviewReason:string;closer:string;color:string;date:string;created:string;time:string;former:boolean;creationRecord:boolean;attribution:'verified'|'review';cancelled:boolean;formerLabel:'Antigo membro'|'Antiga membra'|'Ex-Closer'};
export type HistoricalCandidate={email:string;events:number;distinctLeads:number;company:boolean;proposedName?:string};
export type HistoricalAnalytics={records:HistoricalBooking[];candidates:HistoricalCandidate[];coverage:{accounts:string[];authorAccounts:string[];from:string;until:string;complete:boolean;personalConnected:boolean;review:number;withoutCreated:number;excludedOtherAuthors:number;excludedInternal:number;cancelled:number;sourceCopies:number;uniqueEvents:number;excludedOtherSdr?:number;excludedWithoutCloser?:number;excludedWithoutLead?:number;duplicateLeads?:number;matchedByTitle?:number;matchedByParticipation?:number;sourceMonths?:{month:string;created:number;meetings:number}[]}};
const internal=/\b(daily|weekly|alinhamento|reuni[aã]o interna|treinamento.*crm|comercial.*sdr|sdr.*comercial)\b/i;
export function historicalAnalytics(sources:HistoricalSource[],accounts:string[],complete:boolean,until:string,aliases:string[]=[],closerAliases:{email:string;name:string;eventId?:string}[]=[],proposals:{email:string;name:string}[]=[],assignments:{id:string;name:string}[]=[],otherSdrEmails:string[]=[]):HistoricalAnalytics{
 const otherSdr=new Set(otherSdrEmails.map(x=>x.toLowerCase()));
 const own=new Set([...accounts,...aliases].map(x=>x.toLowerCase()));
 const roster=new Map(configuredClosers.filter(c=>c.calendar!=='reuniao@metodohod.com').map(c=>[c.calendar,c]));
 // Aliases are owner-confirmed person mappings stored privately, independent of calendar access.
 for(const alias of closerAliases.filter(a=>!a.eventId)){const person=configuredClosers.find(c=>c.name===(alias.name==='Lucas'?'Luccas':alias.name)&&c.calendar!=='reuniao@metodohod.com');if(person&&!own.has(alias.email.toLowerCase()))roster.set(alias.email.toLowerCase(),person)}
 const groups=new Map<string,HistoricalSource[]>();for(const s of sources){const list=groups.get(s.canonical_id)||[];list.push(s);groups.set(s.canonical_id,list)}
 const coverage={accounts,authorAccounts:[...own],from:'2026-01-01',until,complete,personalConnected:accounts.some(a=>a.endsWith('@gmail.com')),review:0,withoutCreated:0,excludedOtherAuthors:0,excludedInternal:0,cancelled:0,sourceCopies:sources.length,uniqueEvents:groups.size,excludedOtherSdr:0,excludedWithoutCloser:0,excludedWithoutLead:0,duplicateLeads:0,matchedByTitle:0,matchedByParticipation:0};const records:HistoricalBooking[]=[];const people=new Map<string,{ids:Set<string>;leads:Set<string>}>();const configured=new Set(configuredClosers.map(c=>c.calendar));
 for(const [id,copies] of groups){const ordered=[...copies].sort((a,b)=>a.deleted-b.deleted||a.calendar_id.localeCompare(b.calendar_id));const primary=ordered.find(s=>own.has(s.calendar_id.toLowerCase()))||ordered[0];let e:GoogleEvent;try{e=JSON.parse(primary.raw)}catch{continue}
 const allEvents=ordered.map(s=>{try{return JSON.parse(s.raw) as GoogleEvent}catch{return null}}).filter((x):x is GoogleEvent=>Boolean(x));
 const hosted=allEvents.some(x=>own.has((x.organizer?.email||'').toLowerCase())||own.has((x.creator?.email||'').toLowerCase()));
 const title=e.summary||'';const namedConsultoria=isConsultoriaTitle(title)||/\bconsultoria\b/i.test(title);if(internal.test(title)){coverage.excludedInternal++;continue}
 const participants=[...new Set(allEvents.flatMap(x=>(x.attendees||[]).map(a=>(a.email||'').toLowerCase())))];
 const participating=participants.some(a=>own.has(a));
 if(!namedConsultoria&&!hosted&&!participating){coverage.excludedOtherAuthors++;continue}
 if(participants.some(a=>otherSdr.has(a))){coverage.excludedOtherSdr++;continue}
 const eventRoster=new Map(roster);for(const alias of closerAliases.filter(a=>a.eventId===id)){const person=configuredClosers.find(c=>c.name===(alias.name==='Lucas'?'Luccas':alias.name));if(person)eventRoster.set(alias.email.toLowerCase(),person)}
 const closerEmails=participants.some(a=>eventRoster.has(a))?participants:[...participants,...allEvents.map(x=>(x.organizer?.email||'').toLowerCase())];let candidates=closerEmails.filter(a=>eventRoster.has(a));candidates=candidates.filter((a,i)=>candidates.findIndex(b=>eventRoster.get(b)?.name===eventRoster.get(a)?.name)===i);
 const external=participants.some(a=>a&&!own.has(a)&&!otherSdr.has(a)&&!a.endsWith('@metodohod.com')&&!eventRoster.has(a));
 // Participation is sufficient with closer + external guest. Preserve hosted consultorias with unresolved attribution.
 const leadContact=external||/(?:\+?55\s*)?\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]*\d{4}\b/.test(e.description||'');
 if(!namedConsultoria&&!hosted&&!(participating&&candidates.length&&external))continue;
 if(!namedConsultoria&&!(candidates.length&&leadContact))continue;
 const start=e.start?.dateTime||e.start?.date||primary.starts_at;const date=DateTime.fromISO(start,{zone:'America/Sao_Paulo'}).toISODate();if(!date)continue;
 const createdAt=allEvents.map(x=>x.created||'').filter(Boolean).sort()[0]||copies.map(s=>s.created_at||'').filter(Boolean).sort()[0]||'';
 const created=createdAt?DateTime.fromISO(createdAt,{zone:'America/Sao_Paulo'}).toISODate()||'':'';
 // Keep future meetings created within the career interval. UI explicitly chooses creation or meeting date.
 if(!(created>='2026-01-01'&&created<=until)&&!(date>='2026-01-01'&&date<=until))continue;
 for(const email of participants){if(own.has(email)||otherSdr.has(email)||eventRoster.has(email)||configured.has(email))continue;const person=people.get(email)||{ids:new Set<string>(),leads:new Set<string>()};person.ids.add(id);const lead=(extractConsultoriaLead(title)||title).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s*[-–(].*$/,'').trim();person.leads.add(lead);people.set(email,person)}
 const confirmed=assignments.find(a=>a.id===id);const assigned=confirmed?configuredClosers.find(c=>c.name===(confirmed.name==='Lucas'?'Luccas':confirmed.name)&&c.calendar!=='reuniao@metodohod.com'):null;
 const recipients=assigned?[assigned]:candidates.map(a=>eventRoster.get(a)!);
 if(!recipients.length){coverage.excludedWithoutCloser++;continue}
 if(!leadContact){coverage.excludedWithoutLead++;continue}
 const credits:CloserCredit[]=recipients.map(c=>({name:c.name,color:c.color,former:['former','sdr'].includes(c.teamStatus||''),formerLabel:c.name==='Álvaro'?'Ex-Closer':['Graziela','Karina','Larissa'].includes(c.name)?'Antiga membra':'Antigo membro'}));
 if(namedConsultoria)coverage.matchedByTitle++;else coverage.matchedByParticipation++;
 const closer=recipients[0],attribution='verified' as const;if(!created)coverage.withoutCreated++;

 const cancelled=copies.every(s=>Boolean(s.deleted));if(cancelled)coverage.cancelled++;
 records.push({credits,id,name:extractConsultoriaLead(title)||title.replace(/^.*?\bconsultoria\b[\s|:\-–—]*/i,'').replace(/^(?:reuni[aã]o|conversa|diagn[oó]stico|retorno|follow[- ]?up)(?:\s+com)?[\s|:\-–—]*/i,''),createdAt,startsAt:start,participants,reviewReason:'',closer:credits.map(c=>c.name).join(' + '),color:closer?.color||'',date,created,time:DateTime.fromISO(start,{zone:'America/Sao_Paulo'}).toFormat('HH:mm'),former:Boolean(closer&&['former','sdr'].includes(closer.teamStatus||'')),creationRecord:true,attribution,cancelled,formerLabel:closer?.name==='Álvaro'?'Ex-Closer':closer&&['Graziela','Karina','Larissa'].includes(closer.name)?'Antiga membra':'Antigo membro'});
 }
 const candidates=[...people].filter(([email,p])=>email.endsWith('@metodohod.com')||p.leads.size>=3).map(([email,p])=>({email,events:p.ids.size,distinctLeads:p.leads.size,company:email.endsWith('@metodohod.com'),proposedName:proposals.find(a=>a.email===email)?.name})).sort((a,b)=>b.events-a.events||a.email.localeCompare(b.email));
 // Historical volume is now one lead per normalized name, across all calendars/dates.
 // Keep the earliest creation as the monthly anchor; merge each closer once per lead.
 const leads=new Map<string,HistoricalBooking>();
 records.sort((a,b)=>Date.parse(a.createdAt||a.startsAt)-Date.parse(b.createdAt||b.startsAt)||a.startsAt.localeCompare(b.startsAt)||a.id.localeCompare(b.id));
 for(const record of records){
  record.name=record.name.replace(/\s*[([](?:reagendad[oa]|reagendamento|remarcad[oa]|retorno|follow[- ]?up).*$/i,'').trim();
  const key=record.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(!key)continue;
  const previous=leads.get(key);if(!previous){leads.set(key,record);continue}
  coverage.duplicateLeads++;
  previous.credits=[...new Map([...(previous.credits||[]),...(record.credits||[])].map(c=>[c.name,c])).values()];
  previous.closer=previous.credits.map(c=>c.name).join(' + ');
  previous.participants=[...new Set([...previous.participants,...record.participants])];
  previous.cancelled=previous.cancelled&&record.cancelled;
 }
 const unique=[...leads.values()];coverage.withoutCreated=unique.filter(r=>!r.created).length;coverage.cancelled=unique.filter(r=>r.cancelled).length;
 return {records:unique,candidates,coverage};
}
