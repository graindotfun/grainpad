import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QUOTES} from '../lib/quote-assets.mjs';

await build({entryPoints:['components/wxmr-wallet-note.tsx','components/wallets-faq.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',outdir:'.test-output/wxmr-help',logLevel:'silent'});
const {WxmrWalletNote,WxmrUnwrapLink}=await import('../.test-output/wxmr-help/wxmr-wallet-note.js');
const {WalletsFaq}=await import('../.test-output/wxmr-help/wallets-faq.js');

test('shared note renders the canonical mint and never asserts an unverified balance',()=>{
 const html=renderToStaticMarkup(createElement(WxmrWalletNote));
 assert.ok(html.includes(QUOTES.wXMR.mint));
 assert.ok(html.includes(`${QUOTES.wXMR.mint.slice(0,5)}…${QUOTES.wXMR.mint.slice(-6)}`));
 assert.match(html,/Copy full wXMR mint/);assert.match(html,/If your finalized receipt/);
 assert.doesNotMatch(html,/It.?s in your wallet|Your rewards are there/);
});

test('the note passes the full canonical mint to the actual clipboard button',async()=>{
 const note=WxmrWalletNote();
 const children=note.props.children.flatMap(child=>child?.props?.children||[]);
 const copy=children.find(child=>child?.props?.label==='Copy full wXMR mint');
 assert.equal(copy.props.value,QUOTES.wXMR.mint);
 // Exercise the existing button handler without a browser or wallet. Only its React state hook is stubbed.
 await build({entryPoints:['components/copy-text.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.test-output/wxmr-help/copy-handler.mjs',logLevel:'silent',plugins:[{name:'isolated-copy-state',setup(b){
  b.onResolve({filter:/^react$/},args=>args.importer.endsWith('/copy-text.tsx')?{path:'copy-state',namespace:'copy-state'}:undefined);
  b.onLoad({filter:/.*/,namespace:'copy-state'},()=>({contents:'export const useState = initial => [initial, () => {}];',loader:'js'}));
 }}]});
 const {CopyText}=await import('../.test-output/wxmr-help/copy-handler.mjs');
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator'),writes=[];
 try{Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>writes.push(text)}}});
  await CopyText(copy.props).props.onClick();assert.deepEqual(writes,[QUOTES.wXMR.mint]);
 }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});

test('unwrap is an external link, never an embedded bridge',()=>{
 const html=renderToStaticMarkup(createElement(WxmrUnwrapLink));
 assert.match(html,/href="https:\/\/wxmr.io\/" target="_blank" rel="noreferrer"/);
 assert.match(html,/has not verified its backing or redemption/);assert.doesNotMatch(html,/<iframe|<form/);
});

const platform={exists:true,stale:false,protocolRate:2500,platformRate:7500,creatorRate:2500,rewards:{policyApproved:true,operational:false}};
const render=props=>renderToStaticMarkup(createElement(WalletsFaq,{platform,token:null,tokenState:'ready',solTradingEnabled:false,solLookupConfigured:true,...props}));
test('FAQ uses live rates and current 70/15/15 policy, and keeps activation separate from pilot receipts',()=>{
 const html=render({});
 assert.equal((html.match(/<summary>/g)||[]).length,14);
 assert.match(html,/1.25%: 0.25% Raydium, 0.75% Grainpad and 0.25% creator/);
 assert.match(html,/70% to eligible holders/);assert.match(html,/15% to the GRAIN/);assert.match(html,/15% to Grainpad/);
 assert.match(html,/Public distribution is not active/);assert.match(html,/Not yet: public SOL/);
 assert.match(html,/No official GRAIN mint is registered yet/);assert.doesNotMatch(html,/Copy official GRAIN mint/);
});
test('FAQ never turns failed or stale reads into zero fees, active rewards or a substituted mint',()=>{
 for(const p of [null,{...platform,stale:true},{...platform,protocolRate:null}]){
  const html=render({platform:p,tokenState:'unavailable'});assert.match(html,/Current curve rates are unavailable/);assert.doesNotMatch(html,/current curve fee is 0/);assert.match(html,/no address substituted/);
 }
 assert.match(render({platform:null}),/Live distribution status is unavailable/);
 assert.match(render({platform:{...platform,rewards:{policyApproved:false,operational:true}}}),/Public distribution is not active/);
});
test('FAQ can show a registered official mint and enabled preparation without promising executable liquidity',()=>{
 const html=render({token:{mint:'verified-record-mint'},solTradingEnabled:true,platform:{...platform,rewards:{policyApproved:true,operational:true}}});
 assert.match(html,/verified-record-mint/);assert.match(html,/Copy official GRAIN mint/);
 assert.match(html,/SOL route preparation is enabled/);assert.match(html,/subject to live pool/);assert.match(html,/Holder payment status comes from finalized payments/);assert.doesNotMatch(html,/Public distribution is active/);
 assert.match(render({solTradingEnabled:true,solLookupConfigured:false}),/Not yet/);
});
