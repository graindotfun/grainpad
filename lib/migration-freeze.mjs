/** Temporary infrastructure pause; independent of all business activation flags. */
import {deploymentVersion} from './deployment-version.mjs';
export function migrationFrozen(env){
 // Absent or explicit false is normal operation. A typo in a configured pause
 // fails closed rather than silently allowing writes.
 return env.MIGRATION_WRITE_FREEZE!==undefined&&env.MIGRATION_WRITE_FREEZE!=='false';
}
export function migrationFreezeResponse(request,env,compiledCommit){
 if(!migrationFrozen(env))return null;
 const path=new URL(request.url).pathname,read=request.method==='GET'||request.method==='HEAD';
 if(read&&path==='/api/version'){
  const version=deploymentVersion(env.CF_VERSION_METADATA,compiledCommit,env.GRAINPAD_DEPLOY_COMMIT);
  return new Response(request.method==='HEAD'?null:JSON.stringify(version),{status:version.commit?200:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
 // Immutable static reads bypass framework, cache and background hooks entirely.
 if(read&&/^\/_next\/static\/[A-Za-z0-9_./-]+\.(?:js|css)$/.test(path)&&!path.includes('..')&&env.ASSETS)return env.ASSETS.fetch(request);
 return Response.json({error:'Temporarily paused for data transfer.'},{status:503,headers:{'Retry-After':'60','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
}
