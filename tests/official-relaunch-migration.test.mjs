import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

test('relaunch migration preserves populated generation-one evidence and unrelated ledgers',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(readFileSync(new URL('../drizzle/0026_official_launch_reservation.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../drizzle/0035_official_creator_buy_reservation.sql',import.meta.url),'utf8'));
  db.exec("CREATE TABLE official_token (id INTEGER PRIMARY KEY,mint TEXT NOT NULL,pool TEXT NOT NULL,published_at TEXT NOT NULL,approval TEXT NOT NULL,token_program TEXT NOT NULL); CREATE TABLE preserved_receipts (id TEXT PRIMARY KEY,payload TEXT NOT NULL)");
  db.prepare('INSERT INTO official_token VALUES (1,?,?,?,?,?)').run('previous-mint','previous-pool','2026-10-03','original-approval','original-token-program');
  db.prepare('INSERT INTO official_launch_reservation VALUES (1,?,?,?,?,?,?,?,?,?)').run('previous-mint','previous-creator','metadata-hash','message-hash','launch-signature','blockhash',100,'registered',1);
  db.prepare('INSERT INTO official_creator_buy_reservation VALUES (?,?,?,?,?,?,?,?)').run('previous-mint','previous-creator','buy-review','buy-message',100,1,'buy-signature',2);
  db.prepare('INSERT INTO preserved_receipts VALUES (?,?)').run('receipt-1','original-payload');
  const before={token:db.prepare('SELECT * FROM official_token').get(),reservation:db.prepare('SELECT * FROM official_launch_reservation').get(),attempts:db.prepare('SELECT * FROM official_launch_attempt').all(),buys:db.prepare('SELECT * FROM official_creator_buy_reservation').all(),receipts:db.prepare('SELECT * FROM preserved_receipts').all()};
  db.exec(readFileSync(new URL('../drizzle/0036_official_relaunch_generation.sql',import.meta.url),'utf8'));
  for(const [table,original] of [['official_token_history',before.token],['official_launch_reservation_history',before.reservation]]){
   const archived=db.prepare(`SELECT * FROM ${table} WHERE generation=1`).get();
   for(const [key,value] of Object.entries(original))assert.equal(archived[key],value,`${table}.${key}`);
   assert.equal(archived.status,'previous-unsupported');
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM official_token').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM official_launch_reservation').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM official_generation_identity').get().n,0);
  assert.deepEqual(db.prepare('SELECT * FROM official_launch_attempt').all(),before.attempts);
  assert.deepEqual(db.prepare('SELECT * FROM official_creator_buy_reservation').all(),before.buys);
  assert.deepEqual(db.prepare('SELECT * FROM preserved_receipts').all(),before.receipts);
  assert.throws(()=>db.exec("UPDATE official_creator_buy_reservation SET signature='replacement'"),/immutable/);
  assert.throws(()=>db.exec('DELETE FROM official_creator_buy_reservation'),/cannot be deleted/);
 }finally{db.close();}
});
