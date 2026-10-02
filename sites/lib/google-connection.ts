import {one,run} from '@/db/raw';
import {seal,unseal,config,ProofError,googleList} from './google-proof';
import {classifyCalendar} from './domain';
type Tokens={access:string;refresh?:string;expires:number};
type Connection={tokens:string;expires:number;status:string};
export async function saveConnection(owner:string,token:{access_token:string;refresh_token?:string;expires_in:number}){
 const previous=await one<Connection>('SELECT * FROM google_connections WHERE owner=?',owner);let refresh=token.refresh_token;
 if(!refresh&&previous){try{refresh=(await unseal<Tokens>(previous.tokens,`google:${owner}`)).refresh}catch{}}
 const expires=Date.now()+token.expires_in*1000;
 // Envelope validity is separate from the short access-token lifetime; refresh remains server-only.
 const tokens=await seal({access:token.access_token,refresh,expires:Date.now()+10*365*86400000},`google:${owner}`);
 await run("INSERT INTO google_connections(owner,tokens,expires,connected_at,status) VALUES(?,?,?,?,'connected') ON CONFLICT(owner) DO UPDATE SET tokens=excluded.tokens,expires=excluded.expires,status='connected'",owner,tokens,expires,new Date().toISOString());
}
export async function accessToken(owner:string,force=false){const row=await one<Connection>('SELECT * FROM google_connections WHERE owner=?',owner);if(!row)throw new ProofError(409,'reconnect_required','Conecte o Google Agenda para sincronizar.');const token=await unseal<Tokens>(row.tokens,`google:${owner}`);if(!force&&row.expires>Date.now()+60000)return token.access;
 if(!token.refresh){await run("UPDATE google_connections SET status='reconnect_required' WHERE owner=?",owner);throw new ProofError(409,'reconnect_required','Autorize a conexão contínua com o Google para manter a sincronização.');}
 const c=config();const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:token.refresh,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 if(!r.ok){if(r.status===400)await run("UPDATE google_connections SET status='reconnect_required' WHERE owner=?",owner);throw new ProofError(r.status===400?409:502,r.status===400?'reconnect_required':'google_unavailable','Não foi possível renovar a conexão Google.');}
 const t=await r.json() as {access_token:string;expires_in:number};if(!t.access_token||!t.expires_in)throw new Error('Invalid refresh response');await saveConnection(owner,{...t,refresh_token:token.refresh});return t.access_token;
}
export async function discoverCalendars(owner:string){const token=await accessToken(owner);const list=await googleList<{id:string;summary:string;accessRole:string}>('users/me/calendarList',token,{maxResults:'250'});for(const c of list.items){const info=classifyCalendar(c.id,c.summary);const readable=['owner','writer','reader'].includes(c.accessRole);await run('INSERT INTO calendars(owner,id,name,role,closer,team_status,selected) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET name=excluded.name,role=excluded.role,closer=excluded.closer,team_status=excluded.team_status',owner,c.id,c.summary,c.accessRole,info.name,info.teamStatus,readable&&info.known?1:0)}return list.items.length}
