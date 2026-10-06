import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
const token={mint:'server-listed-token',pool:'pool',name:'Server Listed Token',symbol:'SLT',createdAt:'2026-10-05T12:00:00Z',state:'unknown',lifecycle:'unavailable',quoteAsset:'wXMR',marketCapUsd:null,volume24h:null,change24h:null,progress:null,official:false};
const discovery={tokens:[token],featured:[],total:7,filteredTotal:7,page:1,pages:1,pageSize:20,counts:{all:7,new:0,near:0,graduated:0,unknown:7},officialMint:null,updatedAt:1000,stale:false};
const stats={launches:7,volume:123.45,volumeTokens:1,volumeCoverage:'partial',burned:'351551757634',checkedAt:'2026-10-05T12:00:00Z',stale:false,features:{pairedLaunches:false,onChainRules:false}};
test('homepage HTML contains server-provided launch count, cards and exact burn before browser effects',async()=>{
 const outfile='.test-output/homepage-server-render.mjs';
 await build({entryPoints:['app/page.tsx'],outfile,bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'server-render-boundaries',setup(b){
  b.onResolve({filter:/^@\/app\/api\/site-overview\/route$/},()=>({path:'overview',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/server-homepage$/},()=>({path:'discovery',namespace:'fixture'}));
  b.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'fixture'}));
  b.onResolve({filter:/^@\/components\//},a=>['site-overview','token-discovery','homepage'].some(name=>a.path===`@/components/${name}`)?null:{path:a.path.split('/').at(-1),namespace:'fixture'});
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>{
   if(a.path==='overview')return {contents:`export async function GET(){return Response.json(${JSON.stringify(stats)})}`,loader:'js'};
   if(a.path==='discovery')return {contents:`export async function readHomepageDiscovery(){return ${JSON.stringify(discovery)}}`,loader:'js'};
   if(a.path==='image')return {contents:'export default function Image(){return null}',loader:'js'};
   if(a.path==='use-launch-status')return {contents:'export const useLaunchStatus=()=>({status:{state:"checking",label:"Checking"}})',loader:'js'};
   const name=a.path.split('-').map(v=>v[0].toUpperCase()+v.slice(1)).join('');return {contents:`export function ${name}(){return null}`,loader:'js'};
  });
 }}]});
 const {default:Page}=await import('../'+outfile);
 const html=renderToStaticMarkup(await Page());
 assert.match(html,/Server Listed Token/);
 assert.match(html,/7 launches/);
 assert.match(html,/351551\.757634/);
 assert.match(html,/\$123\.45/);
 assert.match(html,/href="\/rewards#holder-receipts-title"/);
 assert.match(html,/partial coverage/);
});
