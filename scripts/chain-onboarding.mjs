#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {getEvmNetworkTemplate, getEvmOnboardingPlan, validateEvmNetworkManifest} from '../lib/chain/evm-network-manifest.ts';
import {inspectEvmOnboarding} from '../lib/chain/evm-onboarding-readiness.ts';

/** No signing, broadcasting, secret reads, source edits or Cloudflare writes. */
export async function chainOnboarding(args, fetcher = fetch) {
  const options = new Map();
  for(let i=0;i<args.length;i+=2) {
    if(!['--template','--candidate','--public-rpc'].includes(args[i])||!args[i+1]||options.has(args[i])) throw new Error('Invalid onboarding arguments.');
    options.set(args[i],args[i+1]);
  }
  if(Number(options.has('--template'))+Number(options.has('--candidate'))!==1) throw new Error('Choose one template or candidate.');
  const input=options.has('--template')?getEvmNetworkTemplate(options.get('--template')):JSON.parse(readFileSync(options.get('--candidate'),'utf8'));
  const candidate=validateEvmNetworkManifest(input);
  const plan=getEvmOnboardingPlan(candidate);
  if(!options.has('--public-rpc')) return {schemaVersion:1,mode:'offline-plan',slug:candidate.slug,...plan,operatorAction:'Complete the reviewed candidate and run read-only contract inspection; this plan does not enable the chain.'};
  const url=new URL(options.get('--public-rpc'));
  // Authenticated vendor paths must stay in private runtime configuration, never CLI arguments.
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['/','/rpc'].includes(url.pathname)) throw new Error('Use a public HTTPS RPC root without credentials; authenticated RPC belongs in private runtime configuration.');
  let id=0;
  const rpc=async(method,params)=>{
    if(!['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call'].includes(method)) throw new Error('Read-only RPC method refused.');
    const requestId=++id;
    const response=await fetcher(url.href,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),redirect:'error',signal:AbortSignal.timeout(15_000)});
    if(!response.ok)throw new Error('RPC unavailable.');
    const body=await response.json();
    if(body.jsonrpc!=='2.0'||body.id!==requestId||body.error||!Object.hasOwn(body,'result'))throw new Error('Invalid RPC response.');
    return body.result;
  };
  return {mode:'read-only-chain-inspection',slug:candidate.slug,...await inspectEvmOnboarding(candidate,rpc)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await chainOnboarding(process.argv.slice(2)),null,2));}
  catch {console.error('Onboarding inspection failed. Check the candidate schema and public RPC configuration; no chain was enabled and no transaction was sent.');process.exitCode=1;}
}
