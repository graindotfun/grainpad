import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {confirmationsFor, extraFromDaemonTransaction, readDaemon} from '../lib/monero-index.mjs';

test('stock monerod uses a separate get_transactions HTTP endpoint and raw result', async t => {
  const calls=[];
  const server=createServer(async (request,response)=>{
    let text='';for await(const chunk of request)text+=chunk;
    const body=JSON.parse(text);calls.push({path:request.url,body});
    response.setHeader('content-type','application/json');
    if(request.url==='/node/get_transactions'&&!body.jsonrpc){
      response.end(JSON.stringify({status:'OK',txs:[{tx_hash:'ab'.repeat(32)}]}));
    }else if(request.url==='/node/json_rpc'&&body.method==='get_info'){
      response.end(JSON.stringify({jsonrpc:'2.0',id:'0',result:{status:'OK',height:110,mainnet:true,nettype:'mainnet'}}));
    }else response.end(JSON.stringify({jsonrpc:'2.0',id:'0',error:{code:-32601,message:'Method not found'}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/node/json_rpc`;
  assert.equal((await readDaemon(url,'get_info',{})).height,110);
  assert.equal((await readDaemon(url,'get_transactions',{txs_hashes:['ab'.repeat(32)],decode_as_json:true})).txs.length,1);
  assert.equal(calls[1].path,'/node/get_transactions');
  assert.equal(calls[1].body.decode_as_json,true);
  assert.equal(calls[1].body.method,undefined);
});

test('monerod extra is an array of bytes; malformed bytes are not silently coerced',()=>{
  assert.deepEqual(extraFromDaemonTransaction({as_json:JSON.stringify({extra:[1,0,127,255]})}),Buffer.from([1,0,127,255]));
  for(const extra of [[-1],[256],[1.5],['1'],[null],'0','zz']){
    assert.throws(()=>extraFromDaemonTransaction({as_json:JSON.stringify({extra})}),/extra/);
  }
});

test('get_info height is a block count, not the zero-based tip height',()=>{
  assert.equal(confirmationsFor(100,100),0);
  assert.equal(confirmationsFor(100,101),1);
  assert.equal(confirmationsFor(100,109),9);
  assert.equal(confirmationsFor(100,110),10);
  assert.equal(confirmationsFor(-1,110),0);
});
