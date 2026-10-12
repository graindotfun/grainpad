/** A publication inventory gate, complementary to a real secret scanner. */
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(resolve(root,'PUBLIC_EXPORT_MANIFEST.json'),'utf8'));
if(manifest.schema!=='grainpad.public-core.v1'||!Array.isArray(manifest.files)||!/^[a-f0-9]{40}$/.test(manifest.sourceCommit))throw Error('Invalid public export manifest.');
const expected=new Map();
for(const f of manifest.files){
 if(!f||typeof f.path!=='string'||f.path.startsWith('/')||f.path.split('/').some(p=>!p||p==='.'||p==='..')||!/^[a-f0-9]{64}$/.test(f.sha256)||expected.has(f.path))throw Error('Invalid manifest path or hash.');
 expected.set(f.path,f.sha256);
}
const actual=[];
function walk(relative=''){
 for(const entry of readdirSync(resolve(root,relative),{withFileTypes:true})){
  if(!relative&&['.git','node_modules'].includes(entry.name))continue;
  const path=relative?relative+'/'+entry.name:entry.name,stat=lstatSync(resolve(root,path));
  if(stat.isSymbolicLink())throw Error('Public export contains a symlink: '+path);
  if(stat.isDirectory()){walk(path);continue;}
  if(!stat.isFile())throw Error('Public export contains a non-file: '+path);
  if(path==='PUBLIC_EXPORT_MANIFEST.json')continue;
  if(/(^|\/)(silo|notes?|handoffs?|release|migration|security|compatibility|outputs|artifacts|design|data|\.codex|\.agents)(\/|$)|(^|\/)(\.env|\.dev\.vars)|keypair|GRAIN_PROGRESS_LOG|\.pem$|\.key$/i.test(path))throw Error('Private material path in public export: '+path);
  const bytes=readFileSync(resolve(root,path)),text=bytes.toString('utf8');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|https?:\/\/[^\s/]+:[^\s/]+@|[?&](?:api[-_]?key|access[-_]?token)=[a-zA-Z0-9_-]{20,}/i.test(text))throw Error('Potential secret material in public export: '+path);
  if(/graindotfun\/(?:grainpad-private-backup|grainpad-internal)|GRAIN_PROGRESS_LOG\.md|\/Users\//.test(text))throw Error('Private reference in public export: '+path);
  if(expected.get(path)!==createHash('sha256').update(bytes).digest('hex'))throw Error('Unreviewed or modified public export file: '+path);
  actual.push(path);
 }
}
walk();
if(actual.length!==expected.size||[...expected.keys()].some(p=>!actual.includes(p)))throw Error('Public export file inventory does not match manifest.');
console.log('Public inventory and hashes verified: '+actual.length+' files.');
