import {config,identity,ProofError} from './google-proof';
export async function writer(request:Request){const u=await identity();if(request.headers.get('origin')!==config().origin)throw new ProofError(403,'invalid_origin','Use esta ação pelo HOD Hub.');return u}
