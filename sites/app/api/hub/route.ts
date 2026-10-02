import {identity,failure,noStore,ProofError} from '@/lib/google-proof';
import {hubData} from '@/lib/hub-data';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const u=await identity();const date=new URL(request.url).searchParams.get('date')||'';if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new ProofError(400,'invalid_date','Escolha uma data válida.');return Response.json(await hubData(u.userId,date),{headers:noStore})}catch(e){return failure(e)}}
