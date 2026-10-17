/** Restore exact immutable generated client modules from reviewed production archives. */
import {readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join,posix} from 'node:path';
export const CLIENT_ASSETS_MANIFEST_SHA256="9f5d337d3d620b593805cd1f2305203e8f12ba8a388bdb3697da3ea31da01884";
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const pathText=value=>value instanceof URL?fileURLToPath(value):String(value);
const assetPath=path=>typeof path==='string'&&/^\/_next\/static\/(?:(?:chunks|css|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/)?[A-Za-z0-9_.-]+\.(?:js|css)$/.test(path)&&!path.includes('..');
function stat(path){try{return lstatSync(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function directory(path,{create=false}={}){
 const current=stat(path);
 if(current){if(!current.isDirectory()||current.isSymbolicLink())throw Error('Compatibility directory cannot be a symlink or non-directory.');return;}
 if(!create)throw Error('Compatibility directory missing.');
 directory(dirname(path),{create:true});mkdirSync(path);
}
function fileBelow(base,path,{createParents=false}={}){
 if(!assetPath(path))throw Error('Unsafe compatibility asset path.');
 directory(base,{create:createParents});
 let current=base;
 const parts=path.slice(1).split('/');
 for(const part of parts.slice(0,-1)){current=join(current,part);directory(current,{create:createParents});}
 const file=join(current,parts.at(-1)),entry=stat(file);
 if(entry&&(!entry.isFile()||entry.isSymbolicLink()))throw Error('Regular compatibility asset required; symlinks refused.');
 return file;
}
export function validateClientAssetsManifest(manifest){
 if(manifest?.schemaVersion!==1||!Array.isArray(manifest.sources)||(manifest.sources.length<1||manifest.sources.length>1000)||!Array.isArray(manifest.files)||(manifest.files.length<1||manifest.files.length>10000))throw Error('Unreviewed compatibility inventory.');
 const origins=new Set();
 for(const source of manifest.sources){
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(source.id)||origins.has(source.id)||!/^[a-f0-9]{40}$/.test(source.sourceCommit)||!/^[a-f0-9]{64}$/.test(source.archiveSha256)||!/^[A-Za-z0-9_-]+\.tar(?:\.gz)?$/.test(source.archive))throw Error('Invalid compatibility archive provenance.');
  origins.add(source.id);
 }
 const paths=new Set();
 for(const file of manifest.files){
  if(!assetPath(file.path)||paths.has(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>4_000_000||!Array.isArray(file.sources)||!file.sources.length||new Set(file.sources).size!==file.sources.length||file.sources.some(id=>!origins.has(id)))throw Error('Unsafe compatibility asset inventory.');
  paths.add(file.path);
 }
 return paths;
}
/** Resolve static imports, worker URLs and Vite dependency-map entries. */
export function clientAssetReferences(path,text){
 const refs=new Set();
 for(const match of text.matchAll(/["'`]((?:\.\/|\.\.\/|_next\/|\/_next\/)[^"'`]+\.(?:js|css))["'`]/g)){
  const ref=match[1],target=ref.startsWith('.')?posix.normalize(posix.join(posix.dirname(path),ref)):'/'+ref.replace(/^\//,'');
  if(!assetPath(target))throw Error('Unsafe compatibility module reference.');refs.add(target);
 }
 return [...refs];
}
export function restoreClientAssetsCompatibility({root=new URL('../',import.meta.url),output}={}){
 const rootPath=resolve(pathText(root)),outputPath=resolve(output===undefined?join(rootPath,'dist/client'):pathText(output));
 directory(rootPath);
 const manifestPath=join(rootPath,'public/client-assets-compatibility.json');directory(dirname(manifestPath));
 const manifestStat=stat(manifestPath);if(!manifestStat?.isFile()||manifestStat.isSymbolicLink())throw Error('Regular compatibility manifest required.');
 const manifestBytes=readFileSync(manifestPath),manifest=JSON.parse(manifestBytes);
 const paths=validateClientAssetsManifest(manifest);
 if(digest(manifestBytes)!==CLIENT_ASSETS_MANIFEST_SHA256)throw Error('Reviewed compatibility manifest changed.');
 const sourceBase=join(rootPath,'compatibility/client-assets');directory(join(rootPath,'compatibility'));directory(sourceBase);
 const files=[];
 // Validate every source and dependency before creating output or copying anything.
 for(const file of manifest.files){
  const source=fileBelow(sourceBase,file.path),bytes=readFileSync(source);
  if(bytes.length!==file.bytes||digest(bytes)!==file.sha256)throw Error('Compatibility asset changed.');
  for(const ref of clientAssetReferences(file.path,bytes.toString('utf8'))){
   if(paths.has(ref))continue;
   const publicFile=fileBelow(join(rootPath,'public'),ref),entry=stat(publicFile);
   if(!entry?.isFile())throw Error('Compatibility dependency missing.');
  }
  files.push({file,bytes});
 }
 directory(outputPath,{create:true});
 // Check all existing immutable URLs before any writes: no partial overwrite on conflict.
 for(const {file,bytes} of files){const target=fileBelow(outputPath,file.path,{createParents:true});if(stat(target)&&!readFileSync(target).equals(bytes))throw Error('Existing immutable asset URL cannot change bytes.');}
 for(const {file,bytes} of files){const target=fileBelow(outputPath,file.path);if(!stat(target))writeFileSync(target,bytes,{flag:'wx'});}
 return {assets:files.length,bytes:files.reduce((sum,row)=>sum+row.bytes.length,0),sources:manifest.sources.map(row=>row.id)};
}
