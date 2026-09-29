import { PublicKey } from '@solana/web3.js';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import { grainpadPlatformId, decodePlatform, assertGrainpadPolicy } from '../lib/platform-policy.mjs';
import { expectedRuleAccounts, assertRuleAccounts } from '../lib/launch-rules.mjs';
import { connectionFromEnvironment, assertMainnet, safeFailure } from './rpc-config.mjs';
try {
  const platform = process.argv[2] ? new PublicKey(process.argv[2]) : grainpadPlatformId();
  if (!platform.equals(grainpadPlatformId())) throw Error('Unexpected platform PDA.');
  const connection = connectionFromEnvironment(); await assertMainnet(connection);
  const { context, value } = await connection.getMultipleAccountsInfoAndContext([platform, ...expectedRuleAccounts(platform)], 'finalized');
  if (!value[0]?.owner.equals(sdk.LAUNCHPAD_PROGRAM)) throw Object.assign(Error('Platform absent or incorrect owner.'),{code:'PLATFORM_ABSENT_OR_WRONG_OWNER'});
  const policy = decodePlatform(value[0].data); assertGrainpadPolicy(policy);
  const rules = assertRuleAccounts(platform, value.slice(1));
  console.log(JSON.stringify({status:'PASS', readOnly:true, checkedAt:new Date().toISOString(), slot:context.slot, commitment:'finalized', platform:platform.toBase58(), policy, rules}, null, 2));
} catch(error) { if(error.code==='PLATFORM_ABSENT_OR_WRONG_OWNER'){console.log(JSON.stringify({status:'FAIL',readOnly:true,reason:error.code},null,2));process.exitCode=1;}else safeFailure(); }
