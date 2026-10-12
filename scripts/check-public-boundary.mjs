/** Positive tracked-source inventory gate; secret scanning of history is separate. */
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath='PUBLIC_EXPORT_MANIFEST.json';
const manifest=JSON.parse(readFileSync(resolve(root,manifestPath),'utf8'));
if(manifest.schema!=='grainpad.public-source.v2'||!Array.isArray(manifest.files)||!/^[a-f0-9]{40}$/.test(manifest.sourceCommit))throw Error('Invalid public source manifest.');
const expected=new Map();
for(const file of manifest.files){
 if(!file||typeof file.path!=='string'||file.path.startsWith('/')||file.path.split('/').some(part=>!part||part==='.'||part==='..')||!/^[a-f0-9]{64}$/.test(file.sha256)||expected.has(file.path))throw Error('Invalid manifest entry.');
 expected.set(file.path,file.sha256);
}
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(path=>path&&path!==manifestPath);
if(tracked.length!==expected.size||tracked.some(path=>!expected.has(path)))throw Error('Tracked public inventory differs from the reviewed manifest.');
for(const path of tracked){
 const absolute=resolve(root,path),stat=lstatSync(absolute);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Public source must contain regular files only: '+path);
 if(/(^|\/)(silo|outputs|artifacts|compatibility|\.codex|\.agents|\.claude|node_modules|dist|\.vite|\.vinext|\.next|\.wrangler)(\/|$)|(^|\/)(\.env|\.dev\.vars)|GRAIN_PROGRESS_LOG|\.(pem|key|p12|map|zip|tar|gz|tgz|log|jsonl)$/i.test(path))throw Error('Forbidden public source path: '+path);
 const bytes=readFileSync(absolute),text=bytes.toString('utf8');
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|https?:\/\/[^\s/]+:[^\s/]+@|[?&](?:api[-_]?key|access[-_]?token)=[a-zA-Z0-9_-]{20,}/i.test(text))throw Error('Potential credential material: '+path);
 if(/graindotfun\/(?:grainpad-private-backup|grainpad-internal)|GRAIN_PROGRESS_LOG\.md|\/Users\//.test(text))throw Error('Private reference: '+path);
 if(expected.get(path)!==createHash('sha256').update(bytes).digest('hex'))throw Error('Unreviewed or modified source file: '+path);
}
console.log('Public source inventory and hashes verified: '+tracked.length+' files.');
