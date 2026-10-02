import {identity,noStore,failure,ProofError} from '@/lib/google-proof';
import {readHistoricalAnalytics} from '@/lib/hub-data';
import {exportDataset,sheets,csv,xlsx} from '@/lib/analytics-export';
import {DateTime} from 'luxon';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const user=await identity(),q=new URL(request.url).searchParams,from=q.get('from')||'2026-01-01',to=q.get('to')||DateTime.now().setZone('America/Sao_Paulo').toISODate()!,format=q.get('format')||'xlsx',dimension=q.get('dimension')||'creation',team=q.get('team')||'all';
 if(![from,to].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&DateTime.fromISO(d).isValid)||from>to||DateTime.fromISO(to).diff(DateTime.fromISO(from),'years').years>10||!['creation','meeting'].includes(dimension)||!['all','former','current'].includes(team)||!['xlsx','json','csv','ranking','months'].includes(format))throw new ProofError(400,'invalid_export','Filtros de exportação inválidos.');
 const d=exportDataset(await readHistoricalAnalytics(user.userId),from,to,dimension,team),tabs=sheets(d);const name=`hod-hub-${format}-${from}-${to}`;
 const body=format==='xlsx'?xlsx(tabs):format==='json'?JSON.stringify(d,null,2):csv(tabs[format==='ranking'?1:format==='months'?2:0].rows);
 return new Response(body as BodyInit,{headers:{...noStore,'Content-Type':format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':format==='json'?'application/json; charset=utf-8':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name}.${format==='xlsx'?'xlsx':format==='json'?'json':'csv'}"`,'X-Content-Type-Options':'nosniff'}});
 }catch(e){return failure(e)}}
