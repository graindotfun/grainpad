import { readFileSync } from 'node:fs';
import { parseUnsignedTransaction, describeUnsignedTransaction, simulateUnsignedTransaction } from '../lib/unsigned-transaction.mjs';
import { connectionFromEnvironment, assertMainnet, safeFailure } from './rpc-config.mjs';
try {
  const [path, ...flags] = process.argv.slice(2);
  if (!path || flags.some(f => !['--resolve','--simulate'].includes(f))) throw Error('Usage: TX_BASE64_FILE [--resolve] [--simulate]');
  const tx = parseUnsignedTransaction(readFileSync(path, 'utf8'));
  let connection, tables = [];
  if (flags.length) {
    connection = connectionFromEnvironment(); await assertMainnet(connection);
    tables = await Promise.all((tx.message.addressTableLookups || []).map(async lookup => {
      const {value} = await connection.getAddressLookupTable(lookup.accountKey, {commitment:'finalized'});
      if (!value) throw Error('Lookup table unavailable.'); return value;
    }));
  }
  const report = describeUnsignedTransaction(tx, tables);
  if (flags.includes('--simulate')) {
    report.simulation = await simulateUnsignedTransaction(connection, tx);
    if (report.simulation.error) process.exitCode = 1;
  }
  console.log(JSON.stringify(report, null, 2));
} catch { safeFailure(); }
