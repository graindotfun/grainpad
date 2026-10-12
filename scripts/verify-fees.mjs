import {PublicKey} from '@solana/web3.js';
import {POLICY,grainpadPlatformId} from '../lib/platform-policy.mjs';
import {QUOTES} from '../lib/quote-assets.mjs';
import {decodeFeeSnapshot} from '../lib/fee-verification.mjs';
import {connectionFromEnvironment,assertMainnet,safeFailure} from './rpc-config.mjs';
try {
 const connection=connectionFromEnvironment();await assertMainnet(connection);
 const addresses=[grainpadPlatformId(),...Object.values(QUOTES).map(q=>new PublicKey(q.config)),new PublicKey(POLICY.cpConfig)];
 const {context,value}=await connection.getMultipleAccountsInfoAndContext(addresses,'finalized');
 const accounts=value.map(a=>a?{owner:String(a.owner),data:a.data.toString('base64')}:null);
 const report={...decodeFeeSnapshot(accounts),checkedAt:new Date().toISOString(),slot:context.slot,commitment:'finalized',readOnly:true,addresses:addresses.map(String),accounts};
 console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='FEES_MATCH'?0:1;
} catch {safeFailure();}
