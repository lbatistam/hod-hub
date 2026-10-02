import {DateTime} from 'luxon';
import type {Consultation} from './demo';
export const summaryZone='America/Sao_Paulo';
// Operational handoff, never elapsed time. Unknown agendas do not prove handoff.
export function isPassed(c:Consultation){return c.passedToCloser===true}
export function buildDailySummary(rows:Consultation[],date:string,_now:number,complete:boolean){
 const consultorias=rows.filter(c=>c.kind==='consultoria');
 const created=consultorias.filter(c=>c.creationRecord&&DateTime.fromISO(c.createdAt,{zone:summaryZone}).toISODate()===date);
 const meetings=consultorias.filter(c=>c.date===date);
 const passed=meetings.filter(isPassed),notPassed=meetings.filter(c=>!isPassed(c));
 const attended=meetings.filter(c=>c.attendanceRecorded&&c.status==='Compareceu'); // Retained API compatibility; not a daily metric in the UI.
 const absent=meetings.filter(c=>c.googleStruck===true);
 const happened=meetings.filter(c=>c.googleStruck!==true); // User-defined complement; not independently verified attendance.
 return {date,complete,counts:{appointments:meetings.length,qualified:created.filter(c=>c.qualified).length,rescheduled:created.filter(c=>c.rescheduled).length,past:passed.length,notPassed:notPassed.length,attended:attended.length,noShow:absent.length,happened:happened.length},ids:{created:created.map(c=>c.id),meetings:meetings.map(c=>c.id),past:passed.map(c=>c.id),notPassed:notPassed.map(c=>c.id),attended:attended.map(c=>c.id),noShow:absent.map(c=>c.id),happened:happened.map(c=>c.id)}};
}
