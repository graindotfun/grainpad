/** Match compiled main source to the selected production release identity. */
export function deploymentVersion(metadata, expectedCommit, sitesCommit) {
  const valid=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
  if(!valid(expectedCommit))return {commit:null,deployedAt:null};
  const commit = typeof metadata?.tag === 'string' && /^[a-f0-9]{40}$/.test(metadata.tag)
    ? metadata.tag : null;
  const timestamp = metadata?.timestamp;
  // Temporary owner-approved Sites path: its runtime commit must match the
  // compiled GitHub main SHA. Do not invent a deployment timestamp or claim
  // the Sites mirror's Git history is the public application's history.
  if(sitesCommit!==undefined){
    if(!valid(sitesCommit)||sitesCommit!==expectedCommit)return {commit:null,deployedAt:null};
    return {commit:expectedCommit,deployedAt:typeof timestamp==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(timestamp)&&Number.isFinite(Date.parse(timestamp))?new Date(timestamp).toISOString():null};
  }
  if (!commit || commit !== expectedCommit || typeof timestamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    return {commit:null, deployedAt:null};
  }
  return {commit, deployedAt:new Date(timestamp).toISOString()};
}
