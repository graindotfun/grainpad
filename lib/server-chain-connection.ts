import {Connection} from '@solana/web3.js';import {forwardRpc} from './server-rpc';
import type {Network} from './site-config';
/** Server-only read adapter. The public URL is a placeholder; requests use the private display-lane proxy. Mainnet only: getLaunchProof targets the mainnet LaunchLab program. */
export function readConnection(network:Network='mainnet-beta'){
 if(network!=='mainnet-beta')throw Error('On-chain verification reads mainnet. Devnet is not supported.');
 return new Connection('https://grainpad.invalid',{commitment:'finalized',disableRetryOnRateLimit:true,fetch:async(_input,init)=>{
  const body=JSON.parse(String(init?.body));if(!/^get[A-Z]/.test(body.method))throw Error('Read-only connection');
  const response=await forwardRpc(network,body);return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});
 }});
}
