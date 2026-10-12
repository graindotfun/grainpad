import test from 'node:test';
import assert from 'node:assert/strict';
import {isMobileBrowser,walletBrowseLinks} from '../lib/wallet.ts';
test('wallet browse links reopen the exact page, including a token route and query',()=>{
 const page='https://grainpad.fun/token/Abc123grn?ref=tape';
 const [phantom,solflare]=walletBrowseLinks(page);
 assert.equal(phantom.name,'Phantom');assert.equal(solflare.name,'Solflare');
 assert.equal(phantom.href,`https://phantom.app/ul/browse/${encodeURIComponent(page)}?ref=${encodeURIComponent('https://grainpad.fun')}`);
 assert.equal(solflare.href,`https://solflare.com/ul/v1/browse/${encodeURIComponent(page)}?ref=${encodeURIComponent('https://grainpad.fun')}`);
 assert.equal(decodeURIComponent(new URL(phantom.href).pathname.split('/ul/browse/')[1]),page);
 assert.throws(()=>walletBrowseLinks('http://grainpad.fun/launch'),/HTTPS/);
});
test('mobile detection covers iOS, iPadOS desktop mode and Android, not desktop browsers',()=>{
 assert.ok(isMobileBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'));
 assert.ok(isMobileBrowser('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'));
 assert.ok(isMobileBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',5));
 assert.ok(!isMobileBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',0));
 assert.ok(!isMobileBrowser('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'));
});
