/** One read-only snapshot; --baseline compares without rewriting that baseline. */
import fs from 'node:fs';
import {connectionFromEnvironment} from './rpc-config.mjs';
import {observeGrainpadAuthorities,authorityChanges} from '../lib/authority-watcher.mjs';
try{
 const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--baseline'))throw Error('Usage: watch-authorities.mjs [--baseline snapshot.json]');
 const snapshot=await observeGrainpadAuthorities(connectionFromEnvironment());
 if(args.length)snapshot.changes=authorityChanges(JSON.parse(fs.readFileSync(args[1],'utf8')),snapshot);
 console.log(JSON.stringify(snapshot,null,2));if(snapshot.status!=='OBSERVED'||snapshot.changes?.length)process.exitCode=1;
}catch{console.error(JSON.stringify({status:'BLOCKED',readOnly:true,reason:'FINALIZED_AUTHORITY_OBSERVATION_INCOMPLETE'}));process.exitCode=1;}
