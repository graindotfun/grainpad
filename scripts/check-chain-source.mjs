/** Verify every exported network module, including modules outside the site build. */
import {build} from 'esbuild';
import {existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const entries=readdirSync('lib/chain').filter(path=>path.endsWith('.ts')).map(path=>'lib/chain/'+path);
await build({entryPoints:entries,outdir:'.test-output/network-source',write:false,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning',plugins:[{name:'source-alias',setup(b){
 b.onResolve({filter:/^@\//},args=>{
  const base=resolve(args.path.slice(2)),path=['','.ts','.tsx','.mjs','.js','.json'].map(ext=>base+ext).find(existsSync);
  if(!path)throw Error('Unresolved public source alias');
  return {path};
 });
}}]});
console.log('Exported network dependency closures verified: '+entries.length+' modules.');
