import {Connection} from '@solana/web3.js';import {forwardRpc} from './server-rpc';
/** Server-only read adapter. The public URL is a placeholder; requests use the private proxy. */
export function readConnection(){return new Connection('https://grainpad.invalid',{commitment:'finalized',disableRetryOnRateLimit:true,fetch:async(_input,init)=>{
 const body=JSON.parse(String(init?.body));if(!/^get[A-Z]/.test(body.method))throw Error('Read-only connection');
 const response=await forwardRpc('mainnet-beta',body);return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});
}});}
