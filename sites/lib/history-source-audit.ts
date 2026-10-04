import {all,one} from '@/db/raw';
import {connectionAccounts} from './google-connection';
export async function sourceAudit(owner:string){
 const connected=await connectionAccounts(owner),prefs=await one<{json:string}>('SELECT json FROM preferences WHERE owner=?',owner),aliases=(prefs?JSON.parse(prefs.json).historicalAccounts:[])||[];
 const accounts=[...new Set([...connected.map(a=>a.account),...aliases])];
 const calendars=await all('SELECT id,name,role,selected,last_sync,error,page_token IS NOT NULL paginating,coverage_from,coverage_to FROM calendars WHERE owner=?',owner);
 const monthly=await all("SELECT substr(date,1,7) month,COUNT(*) sourceCopies,COUNT(DISTINCT canonical_id) uniqueEvents,COUNT(DISTINCT CASE WHEN kind='consultoria' THEN canonical_id END) consultorias FROM google_events WHERE owner=? AND date>='2026-01-01' AND date<=date('now','-3 hours') GROUP BY month",owner);
 const samples=await all<{canonical_id:string;calendar_id:string;title:string;starts_at:string;raw:string}>("SELECT canonical_id,calendar_id,title,starts_at,raw FROM google_events WHERE owner=? AND date>='2026-08-01' AND date<=date('now','-3 hours') AND kind='consultoria' ORDER BY starts_at DESC LIMIT 100",owner);
 const rows=samples.map(e=>{const r=JSON.parse(e.raw);return {id:e.canonical_id,calendar:e.calendar_id,title:e.title,start:e.starts_at,organizer:r.organizer?.email,creator:r.creator?.email,description:(r.description||'').slice(0,2500),participants:(r.attendees||[]).map((a:{email:string})=>a.email),self:(r.attendees||[]).filter((a:{self:boolean})=>a.self).map((a:{email:string})=>a.email)}});
 return {accounts,calendars,monthly,recentConsultorias:rows};
}
