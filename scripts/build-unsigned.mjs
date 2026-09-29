import { writeFileSync } from 'node:fs';
import { PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { buildPlatformInstructions, buildLaunchInstruction } from '../lib/launch-instructions.mjs';
import { PLATFORM_SETTINGS } from '../lib/platform-settings.mjs';
import { grainpadPlatformId } from '../lib/platform-policy.mjs';

try {
  const [kind, output, ...args] = process.argv.slice(2);
  if (!output || !['platform','launch'].includes(kind)) throw Error('Usage: platform OUTPUT, or launch OUTPUT OWNER MINT QUOTE NAME SYMBOL URI');
  const owner = new PublicKey(kind === 'platform' ? PLATFORM_SETTINGS.admin : args[0]);
  if ((kind === 'platform' && args.length) || (kind === 'launch' && args.length !== 6)) throw Error('Invalid arguments.');
  const platform = grainpadPlatformId();
  const instructions = kind === 'platform' ? buildPlatformInstructions(owner, platform) : [buildLaunchInstruction({owner, mint:new PublicKey(args[1]), platform, symbol:args[2], name:args[3], tokenSymbol:args[4], uri:args[5]}).instruction];
  const tx = new VersionedTransaction(new TransactionMessage({payerKey:owner, recentBlockhash:PublicKey.default.toBase58(), instructions:[
    ComputeBudgetProgram.setComputeUnitLimit({units:kind === 'platform' ? 200000 : 600000}),
    ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}), ...instructions,
  ]}).compileToV0Message());
  const bytes = tx.serialize(); if (bytes.length > 1232) throw Error('Transaction exceeds packet limit.');
  writeFileSync(output, Buffer.from(bytes).toString('base64')+'\n', {flag:'wx', mode:0o600});
  console.log('Wrote unsigned inspection template with a placeholder blockhash. No RPC, keys, signing or submission.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
