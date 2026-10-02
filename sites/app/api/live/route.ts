import {identity,failure,noStore} from '@/lib/google-proof';
import {all,one} from '@/db/raw';
export const dynamic='force-dynamic';
// Check persisted changes cheaply before returning the full historical read model.
export async function GET(){try{const user=await identity();const owner=user.userId;
 const [events,history,prefs,connection,calendars]=await Promise.all([
 one('SELECT COUNT(*) AS n,COALESCE(SUM(deleted),0) AS deleted,MAX(json_extract(raw,\'$.updated\')) AS updated FROM google_events WHERE owner=?',owner),
 one('SELECT COUNT(*) AS n,MAX(at) AS at FROM operational_history WHERE owner=?',owner),
 one('SELECT updated_at FROM preferences WHERE owner=?',owner),
 all('SELECT account,status,connected_at FROM google_accounts WHERE owner=? ORDER BY account',owner),
 all<{id:string;selected:number;last_sync:string|null;error:string|null;syncing:number}>('SELECT id,selected,last_sync,error,(page_token IS NOT NULL OR generation IS NOT NULL) AS syncing FROM calendars WHERE owner=? ORDER BY id',owner)
 ]);
 const payload=JSON.stringify([events,history,prefs,connection,calendars.map(c=>[c.id,c.selected,Boolean(c.last_sync),c.error,c.syncing])]);
 const version=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload))),x=>x.toString(16).padStart(2,'0')).join('');
 return Response.json({version,calendars,checkedAt:new Date().toISOString()},{headers:noStore});
}catch(error){return failure(error)}}
