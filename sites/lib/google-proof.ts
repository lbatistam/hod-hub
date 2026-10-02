// First hosted capability proof. No D1 ingestion or persistent refresh token yet.
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export const noStore={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
export const flowCookie='__Host-hod-google-flow';
export const proofCookie='__Host-hod-google-proof';
export class ProofError extends Error{constructor(public status:number,public code:string,message:string){super(message)}}
export function config(){
const {APP_ORIGIN,GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,OAUTH_COOKIE_KEY}=env;
if(!APP_ORIGIN||!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET||!OAUTH_COOKIE_KEY)throw new ProofError(503,'configuration_required','A conexão Google ainda precisa ser configurada no servidor.');
const origin=new URL(APP_ORIGIN);
if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash)throw new ProofError(503,'configuration_required','O endereço seguro do aplicativo ainda precisa ser configurado.');
return {origin:origin.origin,clientId:GOOGLE_CLIENT_ID,clientSecret:GOOGLE_CLIENT_SECRET,cookieKey:OAUTH_COOKIE_KEY,callback:`${origin.origin}/api/google/callback`};
}
export async function identity(){const user=await getChatGPTUser();if(!user)throw new ProofError(401,'sign_in_required','Entre com sua conta para conectar o Google Agenda.');return user}
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64(value:string){if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid encoding');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0))}
async function key(){const bytes=unb64(config().cookieKey);if(bytes.length!==32)throw new ProofError(503,'configuration_required','A chave segura do servidor precisa ser configurada.');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt'])}
export async function seal(value:object,purpose:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=new TextEncoder().encode(JSON.stringify(value));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(purpose)},await key(),data);return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`}
export async function unseal<T extends {expires:number}>(value:string,purpose:string):Promise<T>{try{if(value.length>4096)throw new Error();const parts=value.split('.');if(parts.length!==2)throw new Error();const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(parts[0]),additionalData:new TextEncoder().encode(purpose)},await key(),unb64(parts[1]));const parsed=JSON.parse(new TextDecoder().decode(data));if(typeof parsed.expires!=='number'||parsed.expires<Date.now())throw new Error();return parsed}catch{throw new ProofError(409,'reconnect_required','A autorização expirou. Conecte o Google novamente.')}}
export function cookieValue(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(`${name}=`))?.slice(name.length+1)||''}
export function cookie(name:string,value:string,maxAge:number){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
export function failure(error:unknown){if(error instanceof ProofError)return Response.json({status:error.code,message:error.message},{status:error.status,headers:noStore});return Response.json({status:'google_unavailable',message:'Não foi possível consultar o Google. Tente novamente.'},{status:502,headers:noStore})}
export type Flow={expires:number;userId:string;state:string;account?:string};
export type ProofSession={expires:number;userId:string;accessToken:string};
export async function googleList<T>(path:string,token:string,params:Record<string,string>={}){let pageToken='';const items:T[]=[];let pages=0;do{const url=new URL(`https://www.googleapis.com/calendar/v3/${path}`);Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));if(pageToken)url.searchParams.set('pageToken',pageToken);const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new ProofError(response.status===401?409:502,response.status===401?'reconnect_required':'google_unavailable',response.status===401?'A autorização expirou. Conecte o Google novamente.':`O Google Agenda respondeu com erro ${response.status}.`);const data=await response.json() as {items?:T[];nextPageToken?:string};if(!Array.isArray(data.items)&&data.items!==undefined)throw new Error('Malformed calendar response');items.push(...(data.items||[]));pageToken=data.nextPageToken||'';pages++;if(pages>=20&&pageToken)throw new ProofError(422,'partial_read','A leitura excedeu o limite da prova. Nenhum resultado parcial foi apresentado como completo.')}while(pageToken);return {items,pages}}
