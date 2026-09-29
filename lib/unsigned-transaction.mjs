import { createHash } from 'node:crypto';
import { VersionedTransaction, TransactionMessage } from '@solana/web3.js';

const names = ['initialize_v2','create_platform_config','update_platform_config','create_platform_allow_config','create_platform_curve_rule','update_platform_curve_rule','buy_exact_in','sell_exact_in'];
const instructions = new Map(names.map(name => [createHash('sha256').update(`global:${name}`).digest('hex').slice(0,16), name]));
const LAUNCHLAB = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';

export function parseUnsignedTransaction(text) {
  const encoded = text.trim();
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error('Expected base64 serialized transaction.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 1232 || bytes.toString('base64') !== encoded) throw Error('Invalid transaction size or encoding.');
  const tx = VersionedTransaction.deserialize(bytes);
  if (tx.signatures.length !== tx.message.header.numRequiredSignatures || tx.signatures.some(sig => sig.some(byte => byte !== 0))) throw Error('Only wholly unsigned transactions are accepted.');
  if (!Buffer.from(tx.serialize()).equals(bytes)) throw Error('Non-canonical or trailing transaction bytes.');
  return tx;
}

export function describeUnsignedTransaction(tx, tables = []) {
  if (tx.signatures.some(sig => sig.some(byte => byte !== 0))) throw Error('Signed transaction refused.');
  const lookupAddresses = (tx.message.addressTableLookups || []).map(t => t.accountKey.toBase58());
  if (lookupAddresses.length && !tables.length) throw Error('Address lookup tables require --resolve or --simulate.');
  const message = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: tables });
  return {
    version:tx.version, unsigned:true, byteLength:tx.serialize().length,
    payer:message.payerKey.toBase58(), recentBlockhash:message.recentBlockhash,
    requiredSigners:tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures).map(k => k.toBase58()),
    addressLookupTables:lookupAddresses,
    instructions:message.instructions.map((ix, index) => ({
      index, program:ix.programId.toBase58(),
      name:ix.programId.toBase58() === LAUNCHLAB ? instructions.get(ix.data.subarray(0,8).toString('hex')) || 'unknown LaunchLab instruction' : 'raw instruction',
      accounts:ix.keys.map(k => ({address:k.pubkey.toBase58(), signer:k.isSigner, writable:k.isWritable})),
      discriminatorHex:ix.data.subarray(0,8).toString('hex'), dataHex:ix.data.toString('hex'), dataBase64:ix.data.toString('base64'),
    })),
    note:'Instruction bytes and account privileges are decoded for inspection. This is not a semantic allowlist, endorsement, or approval to sign.',
  };
}

export async function simulateUnsignedTransaction(connection, tx) {
  if (tx.signatures.some(sig => sig.some(byte => byte !== 0))) throw Error('Signed transaction refused.');
  const result = await connection.simulateTransaction(tx, {sigVerify:false, replaceRecentBlockhash:true, commitment:'finalized'});
  return {slot:result.context.slot, signatureVerification:false, replacedBlockhash:true, error:result.value.err, unitsConsumed:result.value.unitsConsumed, logs:result.value.logs, returnData:result.value.returnData, noTransactionSubmitted:true};
}
