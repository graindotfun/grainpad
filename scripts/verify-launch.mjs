import { PublicKey } from '@solana/web3.js';
import { getLaunchProof } from '../lib/launch-proof.mjs';
import { verifyLaunch } from '../lib/verify-launch.mjs';
import { grainpadPlatformId } from '../lib/platform-policy.mjs';
import { connectionFromEnvironment, assertMainnet, safeFailure } from './rpc-config.mjs';
const args = process.argv.slice(2);
try {
  const official = args[0] === '--official';
  if ((!official && args.length !== 1) || (official && args.length !== 3)) throw Error('Usage: MINT, or --official POOL MINT');
  const connection = connectionFromEnvironment(); await assertMainnet(connection);
  const platform = grainpadPlatformId();
  const report = official
    ? await verifyLaunch({connection, platform:platform.toBase58(), pool:new PublicKey(args[1]).toBase58(), mint:new PublicKey(args[2]).toBase58()})
    : await getLaunchProof(connection, new PublicKey(args[0]), platform);
  // Library errors can contain RPC URLs; preserve the failed check without its raw error text.
  for (const check of report.checks) if (check.status === 'FAIL' && /completed/i.test(check.name)) check.observed = 'Verification could not complete; verify inputs and RPC availability.';
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.status === 'PASS' ? 0 : 1;
} catch { safeFailure(); }
