/** Server-owned opt-in. Absent, boolean, misspelled and legacy flags stay off. */
export const REWARDS_TRACKER_RELEASE_KEY = 'GRAINPAD_REWARDS_TRACKER_RELEASE';
export function rewardsTrackerEnabled(bindings) {
  return bindings?.[REWARDS_TRACKER_RELEASE_KEY] === 'v1';
}
export function trackerUnavailable() {
  return new Response('Not found', {status:404,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
}
