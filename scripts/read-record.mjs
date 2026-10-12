import {readRecord} from '../lib/read-record.mjs';
const usage='MONERO_DAEMON_URL=http://127.0.0.1:18081 npm run read:record -- --tx TX_HASH [--mint SOLANA_MINT --metadata-hash SHA256 --creator SOLANA_CREATOR]';
const args=process.argv.slice(2),values={};
if(args.length===1&&args[0]==='--help'){console.log(usage);process.exit(0);}
const flags=new Set(['--tx','--mint','--metadata-hash','--creator']);
try{
 for(let i=0;i<args.length;i+=2){if(!flags.has(args[i])||!args[i+1]||args[i+1].startsWith('--')||values[args[i]])throw Error('Invalid or duplicate argument.');values[args[i]]=args[i+1];}
 if(!values['--tx']||!process.env.MONERO_DAEMON_URL)throw Error('Transaction hash and MONERO_DAEMON_URL are required.');
 const identity=['--mint','--metadata-hash','--creator'].filter(k=>values[k]);
 if(identity.length&&identity.length!==3)throw Error('Supply all three receipt identity fields together.');
 const expected=identity.length?{mint:values['--mint'],metadataHash:values['--metadata-hash'],creator:values['--creator']}:null;
 const observation=await readRecord({daemonUrl:process.env.MONERO_DAEMON_URL,txHash:values['--tx'],expected});
 console.log(JSON.stringify(observation,null,2));
}catch{
 // Never echo RPC endpoints, credentials, response bodies or arbitrary server error text.
 console.error('Unable to verify this record. Check arguments, receipt identity and synchronized daemon availability.\n'+usage);
 process.exitCode=1;
}
