import {writer} from '@/lib/api';import {failure,noStore} from '@/lib/google-proof';import {syncRound} from '@/lib/sync';
export const dynamic='force-dynamic';
export async function POST(r:Request){try{const u=await writer(r);return Response.json(await syncRound(u.userId),{headers:noStore})}catch(e){return failure(e)}}
