import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeFeeSnapshot} from '../lib/fee-verification.mjs';
import {FEE_POLICY} from '../lib/fee-policy.mjs';
const snapshot=JSON.parse(readFileSync(new URL('./fixtures/fee-accounts.json',import.meta.url)));
test('finalized fee evidence agrees with curve policy and CRRS5 1% creator',()=>{
 const report=decodeFeeSnapshot(snapshot.accounts);
 assert.equal(report.status,'PENDING_PLATFORM');assert.equal(report.platformFees,null);
 assert.deepEqual(report.curveProtocol,[2500,2500]);assert.equal(report.cpmm.trade,2500);assert.equal(report.cpmm.creator,10000);
 assert.equal(report.cpmmMatches,true);assert.equal(report.protocolMatches,true);
 assert.equal(FEE_POLICY.curve.protocol+FEE_POLICY.curve.platform+FEE_POLICY.curve.creator,7500);
});
test('fee verification rejects wrong owners and detects changed CPMM creator rates',()=>{
 const invalid=structuredClone(snapshot.accounts);invalid[3].owner=invalid[1].owner;assert.throws(()=>decodeFeeSnapshot(invalid),/owner/);
 const changed=structuredClone(snapshot.accounts);const bytes=Buffer.from(changed[3].data,'base64');bytes.writeBigUInt64LE(500n,108);changed[3].data=bytes.toString('base64');
 assert.equal(decodeFeeSnapshot(changed).status,'FAIL');assert.equal(decodeFeeSnapshot(changed).cpmmMatches,false);
});
