/** Server simulation-only transport: get* and simulateTransaction; never send*. */
import {Connection} from '@solana/web3.js';
export function createSimulationConnection(forward){
 return new Connection('https://grainpad.invalid',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:async(_input,init)=>{
  const body=JSON.parse(String(init?.body));
  if(!/^get[A-Z]/.test(body.method)&&body.method!=='simulateTransaction')throw Error('Simulation-only connection refuses submission.');
  if(body.method==='simulateTransaction'&&(body.params?.[1]?.encoding!=='base64'||typeof body.params?.[1]?.sigVerify!=='boolean'||body.params?.[1]?.commitment!=='confirmed'||body.params?.[1]?.replaceRecentBlockhash))throw Error('Unsupported simulation proof request.');
  const response=await forward(body);return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});
 }});
}
