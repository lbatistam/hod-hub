import {DateTime} from 'luxon';
import {classifySdrMeeting,extractConsultoriaLead,isQualifiedConsultoriaTitle} from './rules/calendar-rules';
import {closerForCalendar,configuredCloserEmails,configuredClosers} from './rules/closers';
export const zone='America/Sao_Paulo';
export type GoogleEvent={id:string;iCalUID?:string;status?:string;summary?:string;description?:string;created?:string;updated?:string;recurringEventId?:string;originalStartTime?:{dateTime?:string;date?:string};start?:{dateTime?:string;date?:string};end?:{dateTime?:string;date?:string};transparency?:string;organizer?:{email?:string};creator?:{email?:string};attendees?:{email?:string;self?:boolean;responseStatus?:string}[];hangoutLink?:string;conferenceData?:{entryPoints?:{entryPointType?:string;uri?:string}[]};htmlLink?:string};
export function clean(value=''){return value.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim()}
export function normalizeName(v=''){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
export function normalizePhone(v=''){const d=v.replace(/\D/g,'');return d.length>=10?d.slice(-11):''}
export function localDate(v:string){return DateTime.fromISO(v,{zone}).toISODate()}
export function classifyCalendar(id:string,name:string){const haystack=`${id} ${name}`.toLowerCase();const known=configuredClosers.some(c=>haystack.includes(c.calendar));const c=closerForCalendar({id,summary:name});return {...c,teamStatus:known?c.teamStatus:'unknown',known}}
export async function normalizeEvent(e:GoogleEvent,calendarId:string){
 const occurrence=e.originalStartTime?.dateTime||e.originalStartTime?.date||'';
 const identity=`${e.iCalUID||calendarId+':'+e.id}|${occurrence}`;
 const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity))),x=>x.toString(16).padStart(2,'0')).join('');
 const description=clean(e.description),title=e.summary||'Sem título';
 const classification=classifySdrMeeting(e,{sdrEmail:'alvaro@metodohod.com',closerEmails:configuredCloserEmails});
 const name=extractConsultoriaLead(title)||title;
 const phone=description.match(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]*\d{4}\b/)?.[0]||'';
 const start=e.start?.dateTime|| (e.start?.date?DateTime.fromISO(e.start.date,{zone}).toISO():null);
 const end=e.end?.dateTime|| (e.end?.date?DateTime.fromISO(e.end.date,{zone}).toISO():null);
 return {id,title,name,phone,start,end,date:start?localDate(start):null,kind:classification.kind,qualified:isQualifiedConsultoriaTitle(title)?1:0,blocking:e.transparency==='transparent'||e.status==='cancelled'?0:1};
}
export function safeMeet(e:GoogleEvent){const v=e.hangoutLink||e.conferenceData?.entryPoints?.find(p=>p.entryPointType==='video')?.uri||'';try{const u=new URL(v);return u.protocol==='https:'&&u.hostname==='meet.google.com'?v:''}catch{return ''}}
