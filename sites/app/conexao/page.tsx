import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {config} from '@/lib/google-proof';
import GoogleProof from '@/components/google-proof';
import {ButtonLink} from '@openai/apps-sdk-ui/components/Button';
import {Alert} from '@openai/apps-sdk-ui/components/Alert';
export const dynamic='force-dynamic';
export default async function Connection(){
 await requireChatGPTUser('/conexao');let configured=false;try{config();configured=true}catch{}
 return <main className="max-w-3xl mx-auto p-5 md:p-8 space-y-6"><ButtonLink color="primary" variant="ghost" href="/">Voltar ao HOD Hub</ButtonLink><header className="space-y-3"><p className="text-xs text-secondary">CONEXÃO DA OPERAÇÃO</p><h1 className="heading-xl">Conexão Google Agenda</h1><p className="text-sm text-secondary">Autorizar a sincronização segura das agendas.</p></header>{!configured&&<Alert variant="soft" color="warning" title="Configuração hospedada pendente" description="O servidor ainda precisa das credenciais Google e do endereço de retorno autorizado. Nenhuma leitura real foi validada."/>}<GoogleProof configured={configured}/></main>
}
