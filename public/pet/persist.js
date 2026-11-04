/* grainpet persistence. Three modes, decided by the URL and by whether the room is framed by /pet/:
   wallet   framed by /pet/ after sign-in. The grain belongs to one wallet identity (family:network:owner, told to us by the parent page
            and re-checked against the server's answer). The server save is the source of truth; localStorage is only a per-identity cache.
   gate     framed by /pet/ with no verified wallet. Nothing is loaded, created or saved. Draws the connect screen.
   local    ?review=1 only (review builds and tests): the old single local save, never sent anywhere.
   A room opened outside the frame without ?review=1 goes to /pet/. */
(() => {
'use strict';
const QS = new URLSearchParams(location.search), DEV = QS.has('review'), GATE = QS.has('gate'), FRAMED = window.parent !== window;
const LEGACY = 'grainpet.v1', API = '/api/grainpet';
const mode = GATE ? 'gate' : DEV ? 'local' : FRAMED ? 'wallet' : 'redirect';
const never = () => new Promise(() => {});
let identity = null, cacheKey = '', rev = 0, latest = null, lastPushed = '', lastDigest = '', modAt = 0, seenDigest = '', lastPushAt = 0, inflight = null, timer = null, failures = 0, status = 'idle', halted = false;
const statusFns = [], adoptFns = [];
let gateFn = null, flushFn = null, initFn = null;
const toParent = m => { try { parent.postMessage({ grainpet: 1, ...m }, location.origin); } catch {} };
const setStatus = s => { if (s === status) return; status = s; for (const f of statusFns) f(s); };
/* what counts as a meaningful change: everything except the slow drift of needs/dust/dent and the clock, which ride along with the next push */
const digest = o => JSON.stringify({ ...o, seen: 0, needs: { h: Math.round(o.needs.h * 10), e: Math.round(o.needs.e * 10), m: Math.round(o.needs.m * 10) }, dust: Math.round(o.dust * 10), dent: Math.round(o.dent * 10) });
const readCache = () => { try { const c = JSON.parse(localStorage.getItem(cacheKey)); return c && typeof c === 'object' && c.state ? c : null; } catch { return null; } };
const writeCache = c => { try { localStorage.setItem(cacheKey, JSON.stringify(c)); } catch {} };

function listen() {
  addEventListener('message', async e => {
    if (e.origin !== location.origin || e.source !== parent || !e.data || e.data.grainpet !== 1) return;
    const d = e.data;
    if (d.theme === 'dark' || d.theme === 'light') document.documentElement.dataset.theme = d.theme;   /* the site's theme, sent with every message from /pet */
    if (d.type === 'init' && typeof d.identity === 'string') { if (initFn) initFn(d); }
    else if (d.type === 'gate' && gateFn) gateFn(d);
    else if (d.type === 'flush') { try { if (flushFn) flushFn(); await flush(); } finally { toParent({ type: 'flushed', id: d.id }); } }
  });
}
function handshake() {
  return new Promise(res => {
    initFn = d => { initFn = null; res(d); };
    const hello = () => toParent({ type: 'hello', mode });
    hello(); const t = setInterval(() => { if (!initFn) clearInterval(t); else hello(); }, 700);
  });
}
async function getServer() {
  let r;
  try { r = await fetch(API, { credentials: 'same-origin', cache: 'no-store' }); } catch { throw Object.assign(Error('offline'), { code: 'net' }); }
  if (r.status === 401) throw Object.assign(Error('signin'), { code: 'signin' });
  if (!r.ok) throw Object.assign(Error('http ' + r.status), { code: 'net' });
  const j = await r.json();
  if (j.identity !== identity) throw Object.assign(Error('identity'), { code: 'signin' });
  return j;
}
async function start() {
  if (mode === 'redirect') { location.replace('/pet/'); return never(); }
  if (mode === 'gate') { listen(); toParent({ type: 'hello', mode }); const t = setInterval(() => { if (gateFn && !gateSeen) toParent({ type: 'hello', mode }); else clearInterval(t); }, 700); return never(); }
  if (mode === 'local') {
    if (FRAMED) { listen(); handshake().then(d => { identity = d.identity; }); }
    try { return { state: JSON.parse(localStorage.getItem(LEGACY)) }; } catch { return { state: null }; }
  }
  listen();
  const init = await handshake(); identity = init.identity; cacheKey = 'grainpet.v2:' + identity;
  const cache = readCache();
  let server = null;
  try { server = await getServer(); }
  catch (e) { if (e.code === 'signin') { toParent({ type: 'error', code: 'signin' }); return never(); } }
  if (!server) {   /* server unreachable: this same wallet's own cache only; with no cache we cannot know whether a grain exists, so we never invent one */
    if (cache) { rev = cache.rev || 0; latest = cache.state; setStatus('local'); failures = 1; scheduleRetry(); return { state: cache.state }; }
    toParent({ type: 'error', code: 'unreachable' }); return never();
  }
  rev = server.revision;
  let state = server.state;
  if (cache) {   /* the cache wins over the server only when this browser changed something the server has not seen: judged by when something meaningful changed, never by the idle clock that every open tab keeps ticking */
    if (server.revision === 0 || (cache.dirty && (digest(cache.state) === digest(server.state) || (cache.modAt || 0) > (server.updatedAt || 0)))) { state = cache.state; modAt = cache.modAt || 0; }
  }
  lastPushed = server.state ? JSON.stringify(server.state) : ''; lastDigest = server.state ? digest(server.state) : '';
  latest = state; seenDigest = state ? digest(state) : '';
  writeCache({ rev, dirty: !!state && JSON.stringify(state) !== lastPushed, state, modAt });
  if (state && JSON.stringify(state) !== lastPushed) schedule(true);
  return { state };
}
/* modAt = the last time a person touched this room. A tab that only sat there ticking its clock never counts as a change, so it can never overwrite what another tab or device saved. */
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { if (mode === 'wallet') modAt = Date.now(); }, { capture: true, passive: true });
let gateSeen = false;
const gateOn = fn => { gateFn = d => { gateSeen = true; fn(d); }; };
function save(state) {
  const json = JSON.stringify(state);
  if (mode === 'local') { try { localStorage.setItem(LEGACY, json); } catch {} return; }
  if (mode !== 'wallet' || !identity || halted) return;
  latest = state;
  writeCache({ rev, dirty: json !== lastPushed, state, modAt });
  if (json !== lastPushed) schedule(digest(state) !== lastDigest);
}
let timerAt = 0;
function schedule(now) {
  if (halted) return;
  const due = Date.now() + (now ? 2500 : Math.max(2500, 300000 - (Date.now() - lastPushAt)));
  if (timer && timerAt <= due) return;   /* a meaningful change must never wait behind the slow timer that idle drift set */
  clearTimeout(timer); timerAt = due; timer = setTimeout(() => { timer = null; push(); }, due - Date.now());
}
function scheduleRetry() {
  if (timer || halted) return;
  const wait = Math.min(60000, 4000 * 3 ** Math.max(0, failures - 1)); timerAt = Date.now() + wait;
  timer = setTimeout(() => { timer = null; push(); }, wait);
}
function push(opts) {
  const keepalive = !!(opts && opts.keepalive);
  if (mode !== 'wallet' || !identity || halted || !latest) return Promise.resolve();
  if (inflight && !keepalive) return inflight;
  clearTimeout(timer); timer = null;
  const sent = latest, sentJson = JSON.stringify(sent);
  if (sentJson === lastPushed) { setStatus('idle'); return Promise.resolve(); }
  setStatus('saving');
  const p = (async () => {
    try {
      const r = await fetch(API, { method: 'PUT', credentials: 'same-origin', keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision: rev, state: sent }) });
      if (r.status === 200) {
        const j = await r.json(); rev = j.revision; lastPushed = sentJson; lastDigest = digest(sent); lastPushAt = Date.now(); failures = 0;
        const more = latest && JSON.stringify(latest) !== lastPushed;
        writeCache({ rev, dirty: !!more, state: latest || sent, modAt }); setStatus(more ? 'saving' : 'idle'); if (more) schedule(digest(latest) !== lastDigest);
      } else if (r.status === 409) {
        const j = await r.json(), theirs = j.state, same = theirs && JSON.stringify(theirs) === sentJson;
        if (same || (theirs && digest(theirs) === digest(sent))) { rev = j.revision; lastPushed = sentJson; lastDigest = digest(sent); writeCache({ rev, dirty: false, state: sent, modAt }); setStatus('idle'); }   /* same grain, only the idle clock differs */
        else if (!theirs || modAt > (j.updatedAt || 0)) { rev = j.revision; failures = 0; setTimeout(push, 0); }   /* this device changed something after the other save: keep it on top of the other device's revision */
        else { halted = true; writeCache({ rev: j.revision, dirty: false, state: theirs, modAt: 0 }); for (const f of adoptFns) f(); }   /* the other device changed something later: adopt it */
      } else if (r.status === 401) { toParent({ type: 'error', code: 'signin' }); setStatus('local'); }
      else if (r.status === 400) { setStatus('local'); }   /* the server refused this save for good; the local copy stays */
      else throw Error('http ' + r.status);
    } catch { failures++; setStatus('local'); if (!keepalive) scheduleRetry(); }
    finally { if (inflight === p) inflight = null; }
  })();
  if (!keepalive) inflight = p;
  return p;
}
const flush = () => mode !== 'wallet' ? Promise.resolve() : Promise.race([push(), new Promise(r => setTimeout(r, 2000))]);
function pageHide() { if (mode === 'wallet' && latest && JSON.stringify(latest) !== lastPushed) push({ keepalive: true }); }
addEventListener('online', () => { failures = 0; push(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) push(); });

/* review mode only: move the old test save to the connected wallet, once, and only into an empty grain */
async function transferLegacy() {
  if (!DEV || !identity) return 'open this through /pet/ with a connected wallet first.';
  let old; try { old = JSON.parse(localStorage.getItem(LEGACY)); } catch {}
  if (!old) return 'no test save in this browser.';
  let j; try { j = await getServer(); } catch { return 'could not reach the server, or you are signed in as another wallet.'; }
  if (j.revision !== 0) return 'this wallet already has a grain. nothing was changed.';
  const r = await fetch(API, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision: 0, state: old }) });
  return r.ok ? 'moved. open /pet/ without review to see it.' : 'the server refused this save.';
}
window.GrainpetStore = {
  mode, start, save, flush, pageHide, transferLegacy,
  get status() { return status; }, onStatus: f => { statusFns.push(f); }, onAdopt: f => { adoptFns.push(f); }, onGate: gateOn, onFlushRequest: f => { flushFn = f; },
  gateAction: type => toParent({ type }),
  /* start over / restore a backup: the whole grain is replaced, so the cache and the server copy are written now */
  replace: async state => { save(state); await flush(); },
};
})();
