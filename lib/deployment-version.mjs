/** Match the built source to Cloudflare's own version metadata. */
export function deploymentVersion(metadata, expectedCommit) {
  const commit = typeof metadata?.tag === 'string' && /^[a-f0-9]{40}$/.test(metadata.tag)
    ? metadata.tag : null;
  const timestamp = metadata?.timestamp;
  if (!commit || commit !== expectedCommit || typeof timestamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    return {commit:null, deployedAt:null};
  }
  return {commit, deployedAt:new Date(timestamp).toISOString()};
}
