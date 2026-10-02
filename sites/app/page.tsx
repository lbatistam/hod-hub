import {DateTime} from 'luxon';
import Hub from '@/components/apps-hub';
import {requireChatGPTUser} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){const user=await requireChatGPTUser('/');return <Hub initialDate={DateTime.now().setZone('America/Sao_Paulo').toISODate()!} initialClock={DateTime.now().setZone('America/Sao_Paulo').toFormat('HH:mm')} user={{displayName:user.displayName,email:user.email}}/>}
