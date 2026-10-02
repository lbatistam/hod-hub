import {all,one,run} from '@/db/raw';
import {seal,unseal,config,ProofError,googleList} from './google-proof';
import {classifyCalendar} from './domain';
type Tokens={access:string;refresh?:string;expires:number};
type Connection={tokens:string;expires:number;status:string};
export type GoogleAccount={account:string;status:string;connected_at:string};
type Calendar={id:string;summary:string;accessRole:string;primary?:boolean};
async function refreshToken(owner:string,row:Connection,account?:string,force=false){
 const purpose=account?`google:${owner}:${account}`:`google:${owner}`;
 const token=await unseal<Tokens>(row.tokens,purpose);
 if(!force&&row.expires>Date.now()+60000)return token.access;
 const mark=()=>account?run("UPDATE google_accounts SET status='reconnect_required' WHERE owner=? AND account=?",owner,account):run("UPDATE google_connections SET status='reconnect_required' WHERE owner=?",owner);
 if(!token.refresh){await mark();throw new ProofError(409,'reconnect_required',`Renove a autorização ${account||'Google'} para continuar sincronizando.`)}
 const c=config();const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:token.refresh,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 if(!r.ok){if(r.status===400)await mark();throw new ProofError(r.status===400?409:502,r.status===400?'reconnect_required':'google_unavailable',`Não foi possível renovar a conexão ${account||'Google'}.`)}
 const t=await r.json() as {access_token:string;expires_in:number};if(!t.access_token||!t.expires_in)throw new Error('Invalid refresh response');
 const sealed=await seal({access:t.access_token,refresh:token.refresh,expires:Date.now()+10*365*86400000},purpose),expires=Date.now()+t.expires_in*1000;
 if(account)await run("UPDATE google_accounts SET tokens=?,expires=?,status='connected' WHERE owner=? AND account=?",sealed,expires,owner,account);
 else await run("UPDATE google_connections SET tokens=?,expires=?,status='connected' WHERE owner=?",sealed,expires,owner);
 return t.access_token;
}
async function persist(owner:string,account:string,token:{access_token:string;refresh_token?:string;expires_in:number}){
 const previous=await one<Connection>('SELECT * FROM google_accounts WHERE owner=? AND account=?',owner,account);let refresh=token.refresh_token;
 // A refresh token may only be inherited from the same verified Google identity.
 if(!refresh&&previous){try{refresh=(await unseal<Tokens>(previous.tokens,`google:${owner}:${account}`)).refresh}catch{}}
 if(!refresh)throw new ProofError(409,'reconnect_required','Autorize o acesso contínuo desta conta. As conexões existentes foram preservadas.');
 const tokens=await seal({access:token.access_token,refresh,expires:Date.now()+10*365*86400000},`google:${owner}:${account}`);
 await run("INSERT INTO google_accounts(owner,account,tokens,expires,connected_at,status) VALUES(?,?,?,?,?,'connected') ON CONFLICT(owner,account) DO UPDATE SET tokens=excluded.tokens,expires=excluded.expires,status='connected'",owner,account,tokens,Date.now()+token.expires_in*1000,new Date().toISOString());
}
// Additive migration: the original credential remains recoverable and never changes when adding another account.
export async function migrateLegacyConnection(owner:string){
 if(await one('SELECT account FROM google_accounts WHERE owner=? LIMIT 1',owner))return;
 const old=await one<Connection>('SELECT * FROM google_connections WHERE owner=?',owner);if(!old)return;
 const access=await refreshToken(owner,old);const list=await googleList<Calendar>('users/me/calendarList',access,{maxResults:'250'});
 const primary=list.items.find(c=>c.primary);if(!primary||!primary.id.includes('@'))throw new ProofError(409,'reconnect_required','Não foi possível identificar a conta Google original. Renove a conexão.');
 const latest=await one<Connection>('SELECT * FROM google_connections WHERE owner=?',owner);const tokens=await unseal<Tokens>(latest!.tokens,`google:${owner}`);
 await persist(owner,primary.id.toLowerCase(),{access_token:tokens.access,refresh_token:tokens.refresh,expires_in:Math.max(1,Math.floor((latest!.expires-Date.now())/1000))});
 await run('UPDATE calendars SET connection_account=? WHERE owner=? AND connection_account IS NULL',primary.id.toLowerCase(),owner);
}
export async function connectionAccounts(owner:string):Promise<GoogleAccount[]>{return all<GoogleAccount>('SELECT account,status,connected_at FROM google_accounts WHERE owner=? ORDER BY connected_at,account',owner)}
export async function saveConnection(owner:string,token:{access_token:string;refresh_token?:string;expires_in:number},expectedAccount?:string){
 await migrateLegacyConnection(owner);
 const list=await googleList<Calendar>('users/me/calendarList',token.access_token,{maxResults:'250'}),primary=list.items.find(c=>c.primary);
 if(!primary||!primary.id.includes('@'))throw new ProofError(409,'reconnect_required','O Google não informou a identidade da agenda principal. Nenhuma conta foi substituída.');
 const account=primary.id.toLowerCase();if(expectedAccount&&account!==expectedAccount)throw new ProofError(409,'wrong_account',`Você autorizou ${account}. Escolha ${expectedAccount}; as conexões anteriores foram preservadas.`);
 await persist(owner,account,token);return account;
}
export async function accessToken(owner:string,force=false,account?:string){
 if(account){const row=await one<Connection>('SELECT * FROM google_accounts WHERE owner=? AND account=?',owner,account);if(!row)throw new ProofError(409,'reconnect_required',`Conecte ${account} para sincronizar.`);return refreshToken(owner,row,account,force)}
 const first=await one<GoogleAccount>('SELECT account,status,connected_at FROM google_accounts WHERE owner=? ORDER BY connected_at LIMIT 1',owner);
 if(first)return accessToken(owner,force,first.account);
 const row=await one<Connection>('SELECT * FROM google_connections WHERE owner=?',owner);if(!row)throw new ProofError(409,'reconnect_required','Conecte o Google Agenda para sincronizar.');return refreshToken(owner,row,undefined,force);
}
export async function discoverCalendars(owner:string,account?:string){
 await migrateLegacyConnection(owner);const accounts=account?[{account}]:await connectionAccounts(owner);let total=0;const errors:unknown[]=[];
 for(const a of accounts){try{const token=await accessToken(owner,false,a.account);const list=await googleList<Calendar>('users/me/calendarList',token,{maxResults:'250'});
 for(const c of list.items){const info=classifyCalendar(c.id,c.summary),readable=['owner','writer','reader'].includes(c.accessRole);if(!readable)continue;
 await run(`INSERT INTO calendars(owner,id,name,role,closer,team_status,selected,connection_account) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET name=excluded.name,role=CASE WHEN excluded.role='owner' THEN 'owner' ELSE calendars.role END,closer=excluded.closer,team_status=excluded.team_status,connection_account=CASE WHEN excluded.id=excluded.connection_account OR calendars.connection_account IS NULL THEN excluded.connection_account ELSE calendars.connection_account END`,owner,c.id,c.summary,c.accessRole,info.name,info.teamStatus,info.known?1:0,a.account)}total+=list.items.length;
 }catch(e){errors.push(e)}}
 if(errors.length===accounts.length&&errors.length)throw errors[0];return total;
}
