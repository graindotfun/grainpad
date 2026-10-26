/* grain pet, prototype. One grain per save, five fixed characters (mori, nori, pip, rolo, peb), a bond that deepens
   through shared moments. Visuals come from the approved character runtime (art/grain-core.js + art/grain-runtime.js):
   this file decides WHEN and WHY a character acts; the runtime decides HOW it looks.
   Everything is local (localStorage). No wallet, no network, no rewards. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const HOUR = 3600000;
let CLOCK = 0;   /* review mode only: a simulated clock offset (ms), kept per tab so a reload keeps the simulated time */
try { if (new URLSearchParams(location.search).has('review')) CLOCK = Number(sessionStorage.getItem('grainpet.clock')) || 0; } catch {}
const NOW = () => Date.now() + CLOCK;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const QS = new URLSearchParams(location.search), DEV = QS.has('review');   /* review mode: time tools and diagnostics, never shown to players */
const LS = 'grainpet.v1';

/* ---------- scene constants (viewBox 512 x 540) ---------- */
const W = 512, H = 540, GROUND = 452, SCL = 0.62;
const BASE_OWNED = ['wall:cream', 'cloth:cream', 'bowl:cream', 'shelfObj:none', 'deco:window', 'plate:off', 'plate:cream'];
const BOWL_X = 74, MATX = 372, MID = 250, X_MIN = 150, X_MAX = 320;
const C = { wall: '#e9dac6', top: '#d6bc92', front: '#b89a70', edge: '#9d8260', ink: '#1a1714' };
/* distances from the anchor, in runtime units (grain-core.js): where each character's props sit */
const PD = { mori: 172, nori: 178, pip: 146, rolo: 212, peb: 170 };
const PUSH_END = { mori: 36, nori: 38, pip: 150, rolo: 12, peb: 18 };   /* how far the pebble ends up after `push` (defaults; read from the manifest at boot) */
const CRUMB_D = { mori: 300, nori: 306, pip: 297, rolo: 333, peb: 286 }, CRUMB_ROT = { mori: -20, nori: 28, pip: -20, rolo: -20, peb: -20 };   /* eat v2 values; read from the manifest at boot */
let MAN = null;
/* the manifest (grain-friends/2) is the source for prop distances; the tables above are only fallbacks */
function deriveFromManifest(m) {
  MAN = m;
  for (const [n, c] of Object.entries(m.characters)) {
    const A = c.actions, f = (act, id) => { const p = (A[act].props || []).find(q => q.id === id); return p && p.byDir['1']; };
    const ps = f('push', 'pebble'); if (ps) { PD[n] = ps.start.x; PUSH_END[n] = ps.end ? ps.end.x - ps.start.x : 0; }
    const ecs = (A.eat.props || []).find(q => q.id === 'crumb'), ec = ecs && ecs.byDir['-1']; if (ec) { CRUMB_D[n] = Math.abs(ec.start.x); CRUMB_ROT[n] = ec.start.rotation; }
    const rp = f('ritual', 'pebble'); if (rp && RIT[n].kind === 'pebble') RIT[n].start = rp.start.x;
    const rc = f('ritual', 'cloth'); if (rc && RIT[n].kind === 'mat') RIT[n].at = MATX - rc.start.x * SCL;
  }
}
const RIT = {
  mori: { kind: 'pebble', start: 172, d: -1, at: 290 }, nori: { kind: 'mat', d: 1, at: MATX },
  pip: { kind: 'pebble', start: 119, d: 1, at: 190 }, rolo: { kind: 'mat', d: 1, at: MATX - 186 * SCL },
  peb: { kind: 'pebble', start: 170, d: -1, at: 280 },
};
const MAT_W = { mori: 250, nori: 260, pip: 250, rolo: 240, peb: 250 };

/* ---------- personalities ---------- */
const TYPES = ['mori', 'nori', 'pip', 'rolo', 'peb'];
const BASE_LINES = {
  wake: [['oh. morning.'], ['mostly awake.']], away: [['had a nap. then another.']], back: [['oh. you.']], better: [['better. thanks.']],
  hungry: [['crumb, please.'], ['a small crunch would help.']], full: [['full, thanks.']],
  eat: [['thank you.']], fav: [['yes. that one.']], pet: [['this is nice.']], flinch: [['oh. careful.']],
  enough: [['enough for now.']], sleepy: [['sleepy.']], decline: [['not tired.']], play: [['once more.']],
  done: [['same again, sometime.']], bond: [['a little more me.'], ['still grain.']], idle: [['hm.']],
};
const LINES = {
  mori: { greet: [['oh. hello.', 'seems fine.'], ['you again.', 'hm.'], ['oh. hi.', 'still works.'], ['there you are.']],
    eat: [['tested. approved.'], ['acceptable.']], pet: [['hm. fine.'], ['that works.']], flinch: [['hm. careful.']],
    full: [['not now.'], ['later. maybe.']], invite: [['your go.']], done: [['good there.'], ['same again, sometime.']],
    play: [['once more.'], ['good there.']], idle: [['hm.'], ['checking.'], ['seems fine.']], decline: [['not tired.'], ['later.']],
    back: [['oh. hello again.']], miss: [['there you are.', 'the room kept still.']], better: [['better. thanks.']] },
  nori: { greet: [['hello. welcome.', 'one moment.'], ['oh. hello.', 'all tidy.'], ['good timing.'], ['there you are.', 'i saved room.']],
    eat: [['very neat.'], ['thank you.']], pet: [['oh. nice.'], ['neat.']], invite: [['this bit.']],
    done: [['there.'], ['same again, sometime.']], play: [['tidy.'], ['there.']], idle: [['almost straight.'], ['hm.']], full: [['saving it.']],
    back: [['oh. welcome back.']], miss: [['you are back.', 'i kept your spot.']], better: [['there. much better.']] },
  pip: { greet: [['hi. hi. okay.'], ['you came back.'], ['oh! hi.'], ['ready. probably.']],
    eat: [['crunch.'], ['oh, good.']], pet: [['again. no. yes.'], ['this is nice.']], flinch: [['whoa. hi.']],
    invite: [['ready. probably.']], done: [['again?'], ['same again, sometime.']], play: [['ready. probably.'], ['again?']], idle: [['hm.'], ['almost.']], decline: [['not tired. much.']],
    back: [['oh! hi.']], miss: [['you! hi. okay.', 'hi again.']], better: [['oh. much better!']] },
  rolo: { greet: [['oh. hello.', 'take your time.'], ['hello again.'], ['the usual?'], ['there you are.']],
    eat: [['slowly. good.'], ['mm.']], pet: [['mm. stay.'], ['this is nice.']], invite: [['the usual.']],
    done: [['mm. good.'], ['same again, sometime.']], play: [['in a bit.'], ['okay. slowly.']], idle: [['mm.'], ['hm.']], full: [['later. thanks.']], decline: [['soon.']],
    back: [['mm. hello.']], miss: [['mm. there you are.', 'good.']], better: [['mm. thank you.']] },
  peb: { greet: [['oh. hello.', 'look at this.'], ['hello. one sec.'], ['you are here.', 'good.'], ['found this.']],
    eat: [['interesting.'], ['oh, good.']], pet: [['this is nice.'], ['hm. nice.']], invite: [['found this.']],
    done: [['kept it.'], ['same again, sometime.']], play: [['odd shape.'], ['hm. look.']], idle: [['hm.'], ['look at that.']], full: [['full. look, though.']],
    back: [['oh. look.']], miss: [['you came.', 'saved you something.']], better: [['now i can look around.']] },
};
const line = (type, key, stage) => {
  const L = LINES[type][key] || BASE_LINES[key] || BASE_LINES.idle;
  if (key === 'greet') return L[clamp(stage, 0, 3)];
  return pick(L);
};
const FOODS = ['warm mineral crumb', 'popped kernel', 'toasted flake'];
const NOTE = {
  first: n => `${n} arrived. looked around first.`, feed: () => 'first crumb. accepted.',
  pet: () => 'let you brush the dust off.', play: () => 'found the pebble. kept it.',
  nap: n => `fell asleep with you watching.`, fav: (n, st) => `${FOODS[st.prefs.food]} is the favourite.`,
  known: () => 'the pebble thing is now a thing.', init: n => `${n} started it first.`,
  away: (n, st, h) => `you were gone ${h >= 48 ? Math.round(h / 24) + ' days' : Math.round(h) + ' hours'}. napped through it.`,
  ritual: () => 'the first ritual. it started to feel like a routine.', find: () => 'brought something small to show.', note: () => 'read the first grain note.',
  mem_meeting: () => 'a memory frame opened on the wall: the first meeting.', mem_ritual: () => 'a memory frame opened: the first ritual.', mem_find: () => 'a memory frame opened: the first find.', mem_note: () => 'a memory frame opened: the first grain note.',
  coll: () => 'a keepsake for the little shelf.',
};

/* ---------- save ---------- */
let st = null;
const uid = () => Math.random().toString(36).slice(2, 10);
function newState(type) {
  type = type || pick(TYPES);
  return { v: 1, id: uid(), type, name: type, prefs: { food: Math.floor(rnd(0, 3)), rest: Math.floor(rnd(0, 2)), gest: Math.floor(rnd(0, 3)) },
    needs: { h: .7, e: .85, m: .6 }, bond: { meet: 0, lastMeet: 0, play: 0, lastPlayMeet: -1, ritual: 0, init: 0, favSeen: 0 },
    dust: 0, dent: 0, coll: [], notes: [], ideas: [], home: { wall: 'cream', cloth: 'cream', bowl: 'cream', shelfObj: 'none', decoA: null, decoB: null, comp: 0, plate: 'cream', frames: { hero: null, s1: null, s2: null }, lastPlaced: null, seen: BASE_OWNED.slice(), announced: BASE_OWNED.slice() },
    finds: { got: [], shown: [], lastMeet: 0, pending: null }, memories: {}, notesRead: [], born: NOW(), seen: NOW(), sessions: 0, flags: {} };
}
function sanitize(o) {
  if (!o || typeof o !== 'object' || o.v !== 1 || !TYPES.includes(o.type)) return null;
  const n = newState(o.type), num = (v, a, b, d) => Number.isFinite(v) ? clamp(v, a, b) : d;
  n.id = String(o.id || n.id).slice(0, 16).replace(/[^a-z0-9]/gi, '');
  n.name = String(o.name || o.type).replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 16) || o.type;
  const p = o.prefs || {}; n.prefs = { food: num(p.food | 0, 0, 2, 0), rest: num(p.rest | 0, 0, 1, 0), gest: num(p.gest | 0, 0, 2, 0) };
  const q = o.needs || {}; n.needs = { h: num(q.h, 0, 1, .7), e: num(q.e, 0, 1, .85), m: num(q.m, 0, 1, .6) };
  const b = o.bond || {}; n.bond = { meet: num(b.meet | 0, 0, 9999, 0), lastMeet: num(b.lastMeet, 0, 4e12, 0), play: num(b.play | 0, 0, 9999, 0), lastPlayMeet: num(b.lastPlayMeet | 0, -1, 9999, -1), ritual: num(b.ritual | 0, 0, 9999, 0), init: num(b.init | 0, 0, 9999, 0), favSeen: num(b.favSeen | 0, 0, 99, 0) };
  n.dust = num(o.dust, 0, 1, 0); n.dent = num(o.dent, 0, 1, 0);
  n.coll = (Array.isArray(o.coll) ? o.coll : []).slice(0, 5).map(k => clamp(k | 0, 0, 4));
  n.notes = (Array.isArray(o.notes) ? o.notes : []).slice(-60).map(x => ({ t: num(x && x.t, 0, 4e12, 0), s: String((x && x.s) || '').slice(0, 140) }));
  n.ideas = (Array.isArray(o.ideas) ? o.ideas : []).slice(-12).map(x => ({ id: String((x && x.id) || uid()).slice(0, 12).replace(/[^a-z0-9]/gi, ''), t: num(x && x.t, 0, 4e12, 0), s: String((x && x.s) || '').slice(0, 80) })).filter(x => x.s);
  const hm = o.home || {}, ids = a => (Array.isArray(a) ? a : []).slice(0, 60).map(x => String(x).slice(0, 24));
  const pickKey = (cat, v) => (CAT[cat].opts[v] ? v : CAT[cat].def); const mdeco = v => (CAT.deco.opts[v] ? v : null);
  n.home = { wall: pickKey('wall', hm.wall), cloth: pickKey('cloth', hm.cloth), bowl: pickKey('bowl', hm.bowl), shelfObj: pickKey('shelfObj', hm.shelfObj), decoA: mdeco(hm.decoA), decoB: mdeco(hm.decoB), comp: clamp(hm.comp | 0, 0, 2), plate: pickKey('plate', hm.plate),
    frames: { hero: MEM[(hm.frames || {}).hero] ? hm.frames.hero : null, s1: MEM[(hm.frames || {}).s1] ? hm.frames.s1 : null, s2: MEM[(hm.frames || {}).s2] ? hm.frames.s2 : null }, lastPlaced: hm.lastPlaced && typeof hm.lastPlaced.label === 'string' ? { label: hm.lastPlaced.label.slice(0, 40), slot: SLOTS[hm.lastPlaced.slot] ? hm.lastPlaced.slot : null } : null, seen: [...new Set([...ids(hm.seen), ...BASE_OWNED])], announced: [...new Set([...ids(hm.announced), ...BASE_OWNED])] };
  const fd = o.finds || {}, fid = a => [...new Set((Array.isArray(a) ? a : []).map(x => clamp(x | 0, 0, 4)))].slice(0, 5);
  n.finds = { got: fid(fd.got), shown: fid(fd.shown).filter(x => fid(fd.got).includes(x)), lastMeet: num(fd.lastMeet | 0, 0, 9999, 0), pending: fd.pending === null || fd.pending === undefined ? null : clamp(fd.pending | 0, 0, 4) };
  n.memories = {}; for (const k of Object.keys(MEM)) { const m = o.memories && o.memories[k]; if (m && Number.isFinite(m.t)) n.memories[k] = { t: clamp(m.t, 0, 4e12), ...(Number.isFinite(m.f) ? { f: clamp(m.f | 0, 0, 4) } : {}) }; }
  n.notesRead = ids(o.notesRead).filter(x => NOTES.some(t => t.id === x));
  n.born = num(o.born, 0, 4e12, NOW()); n.seen = num(o.seen, 0, 4e12, NOW()); n.sessions = num(o.sessions | 0, 0, 1e6, 0);
  n.flags = (o.flags && typeof o.flags === 'object') ? Object.fromEntries(Object.entries(o.flags).slice(0, 30).map(([k, v]) => [String(k).slice(0, 20), !!v])) : {};
  return n;
}
function load() { try { return sanitize(JSON.parse(localStorage.getItem(LS))); } catch { return null; } }
let noSave = false;
function save() { if (noSave) return; try { st.seen = NOW(); localStorage.setItem(LS, JSON.stringify(st)); } catch {} }
const day = () => Math.floor((NOW() - st.born) / 86400000) + 1;
function note(key, ...a) { if (st.flags['n_' + key]) return; st.flags['n_' + key] = true; st.notes.push({ t: NOW(), s: `day ${day()}. ` + NOTE[key](st.name, st, ...a) }); }
const stageOf = () => { const m = st.bond.meet; return m === 0 ? 0 : m < 2 ? 1 : m < 4 ? 2 : 3; };


/* ---------- live state ---------- */
const OB = { pebble: { vis: false, x: 230, y: 0, vy: 0, rot: 0 }, crumb: null, crumbOff: null, crumbY: 0, crumbVy: 0, bowlDx: 0 };
const parts = [];
let S = null, T = 0, g = null, cur = null, pending = null, curFirst = false, curIdle = false;
const sc = $('#sc'), gBack = $('#gBack'), gChar = $('#gChar'), gFront = $('#gFront'), sayEl = $('#say');
/* ---------- caption ---------- */
let sayQ = [], sayT = 0;
function say(lines) { sayQ = (Array.isArray(lines) ? lines : [lines]).slice(); sayT = 0; nextSay(); }
function nextSay() {
  if (!sayQ.length) { sayEl.classList.add('off'); return; }
  const s = sayQ.shift(); sayEl.replaceChildren();
  for (const ch of s) { if (ch === '.') { const e = document.createElement('span'); e.className = 'dot'; e.textContent = '.'; sayEl.append(e); } else sayEl.append(ch); }
  sayEl.classList.toggle('off', !!EDIT); sayT = 2.0 + s.length * 0.03;   /* while customising the wall the caption stays quiet */
}

/* ---------- scene drawing ---------- */
const prop = (x, inner) => `<g transform="translate(${x.toFixed(1)} ${GROUND}) scale(${SCL})">${inner}</g>`;
const PLATE = `<g transform="translate(0 -2)"><ellipse cx="0" cy="1" rx="52" ry="12" fill="#1a1714"/><ellipse cx="0" cy="-1" rx="38" ry="7" fill="#3a342e"/></g>`;
/* ---------- home: a lived-in place. It grows from shared moments; nothing is bought, nothing is a streak, nothing fills itself ---------- */
const ESC = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PERSONAL = { mori: 'magnifier', nori: 'folded cloths', pip: 'bouncy ball', rolo: 'pillow', peb: 'little jar' };
const GESTURE = { mori: 'checks things twice.', nori: 'straightens the cloth first.', pip: 'jumps a little too high.', rolo: 'takes the long way round.', peb: 'always has something to show.' };
/* catalogue: category -> option -> {name, need, hint}. `need` reads the bond counters, so ownership is derived and never stored */
const CAT = {
  wall: { label: 'wall', def: 'cream', opts: {
    cream: { name: 'cream', c: '#e9dac6', glow: '#f3e6d2', need: () => true },
    peach: { name: 'peach', c: '#f1cdb0', glow: '#f8dcc4', need: () => st.bond.meet >= 3, hint: 'after a few visits' },
    night: { name: 'night', c: '#2c2723', glow: '#3a332d', need: () => st.bond.meet >= 4, hint: 'after a few more visits' } } },
  cloth: { label: 'cloth', def: 'cream', opts: {
    cream: { name: 'cream', body: '#e9dac6', stripe: '#ff6600', need: () => true },
    ink: { name: 'ink', body: '#1a1714', stripe: '#fff5e6', need: () => st.bond.meet >= 2, hint: 'after your 2nd visit' },
    orange: { name: 'orange', body: '#ff9447', stripe: '#fff5e6', need: () => st.bond.meet >= 4, hint: 'after a few more visits' } } },
  bowl: { label: 'plate', def: 'cream', opts: {
    cream: { name: 'cream', a: '#f3e6d2', b: '#e0cfb4', c: '#c9b592', need: () => true },
    orange: { name: 'orange', a: '#ff9447', b: '#e8590a', c: '#d94e00', need: () => st.bond.meet >= 2, hint: 'after your 2nd visit' },
    ink: { name: 'ink', a: '#4a4440', b: '#1a1714', c: '#2a2521', need: () => st.bond.meet >= 4, hint: 'after a few more visits' } } },
  shelfObj: { label: 'shelf', def: 'none', opts: {
    none: { name: 'empty', need: () => true },
    plant: { name: 'plant', need: () => st.bond.meet >= 1, hint: 'after your first visit' },
    lamp: { name: 'lamp', need: () => st.bond.meet >= 3, hint: 'after your 3rd visit' },
    books: { name: 'books', need: () => st.bond.meet >= 4, hint: 'after a few more visits' },
    personal: { name: 'its own', need: () => st.bond.ritual >= 1, hint: 'opens with the first ritual' } } },
  deco: { label: 'wall art', def: null, opts: {
    board: { name: 'idea board', need: () => st.bond.meet >= 2, hint: 'after your 2nd visit' },
    poster: { name: 'poster', need: () => st.bond.meet >= 2 && day() >= 3, hint: 'after a few days' },
    flags: { name: 'flags', need: () => st.bond.meet >= 3, hint: 'after your 3rd visit' },
    clock: { name: 'clock', need: () => st.bond.meet >= 4, hint: 'after a few more visits' },
    xmr: { name: 'xmr chart', need: () => xmrAvailable(), hidden: () => !xmrAvailable() },
    xmrf: { name: 'xmr chart, large', need: () => xmrAvailable(), hidden: () => !xmrAvailable() } } },
  plate: { label: 'nameplate', def: 'cream', opts: {
    off: { name: 'none', need: () => true },
    cream: { name: 'cream', bg: '#fff5e6', fg: '#1a1714', need: () => true },
    orange: { name: 'orange', bg: '#ff6600', fg: '#fff5e6', need: () => st.bond.meet >= 3, hint: 'after your 3rd visit' },
    ink: { name: 'ink', bg: '#1a1714', fg: '#fff5e6', need: () => st.bond.meet >= 4, hint: 'after a few more visits' } } },
};
const optName = (c, k) => (c === 'shelfObj' && k === 'personal' ? PERSONAL[st.type] : CAT[c].opts[k].name);
const optOf = (cat, key) => { const c = CAT[cat], o = c.opts[key]; return o && o.need() ? o : c.opts[c.def]; };
/* the four moments a memory frame can hold; they open on real events and never place themselves */
const MEM = {
  meeting: { name: 'first meeting', hint: 'your first visit' },
  ritual: { name: 'first ritual', hint: 'the first thing you do together' },
  find: { name: 'first find', hint: 'when it brings you something' },
  note: { name: 'first grain note', hint: 'when you read a grain note' },
};
const ownedIds = () => { const r = []; for (const [c, v] of Object.entries(CAT)) for (const [k, o] of Object.entries(v.opts)) if (o.need() && !k.startsWith('xmr')) r.push(c + ':' + k);   /* the chart is never announced as an unlock */ for (const k of Object.keys(st.memories)) r.push('mem:' + k); return r; };
const labelOf = id => { const [c, k] = id.split(':'); return c === 'mem' ? 'a memory frame: ' + MEM[k].name : optName(c, k) + ' (' + CAT[c].label + ')'; };
const RITUAL_LINE = { mori: n => `${n} rolled the pebble out, watched it, and approved.`, nori: n => `${n} straightened the cloth, end by end.`, pip: n => `${n} hopped the pebble twice and landed wide.`, rolo: n => `${n} settled onto the cloth, slowly.`, peb: n => `${n} showed a find, then took it back.` };
const FOUND_LINE = { mori: n => `${n} checked it twice, then brought it over.`, nori: n => `${n} straightened it before bringing it.`, pip: n => `${n} ran the whole way with it.`, rolo: n => `${n} brought it over, slowly.`, peb: n => `${n} has been looking for this one.` };
/* the sentence is always built from the real moment, the current name and the character, never stored text */
const memText = k => { const m = st.memories[k], n = st.name; if (!m) return ''; return k === 'meeting' ? `${n} and you met. ${n} looked around first.` : k === 'ritual' ? RITUAL_LINE[st.type](n) : k === 'find' ? `${n} brought ${FINDS[m.f === undefined ? 0 : m.f].n}.` : 'you read the first grain note: you hold the keys.'; };
const unlockMemory = (k, f) => { if (!st.memories[k]) { st.memories[k] = { t: NOW(), ...(f !== undefined ? { f } : {}) }; S && (S.checkUnlocks = true); save(); } };

const FINDS = [{ n: 'a bent twig' }, { n: 'a shell chip' }, { n: 'a striped seed' }, { n: 'a bottle cap' }, { n: 'a glossy bead' }];   /* same order as findSvg */
const FIND_ORDER = { mori: [2, 0, 4, 1, 3], nori: [4, 1, 0, 3, 2], pip: [0, 4, 2, 3, 1], rolo: [3, 2, 1, 0, 4], peb: [1, 3, 0, 2, 4] };
const FIND_EVERY = { mori: 4, nori: 3, pip: 3, rolo: 4, peb: 2 };   /* shared visits between finds: peb collects, rolo takes its time */
const findSvg = k => [
  '<path d="M-14 0 L-2 -9 L12 -5 M-2 -9 L-4 -18" fill="none" stroke="#6b4a33" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>',
  '<ellipse cx="0" cy="-8" rx="10" ry="7.5" fill="#f4d9c6"/><path d="M-3 -8a4 3 0 1 1 6 0" fill="none" stroke="#c9a28a" stroke-width="2"/>',
  '<ellipse cx="0" cy="-10" rx="7" ry="10" fill="#7a5a3a" transform="rotate(14 0 -10)"/><path d="M-2 -16v10" stroke="#a5835d" stroke-width="2"/>',
  '<circle cx="0" cy="-9" r="10" fill="#b9bec4"/><circle cx="0" cy="-9" r="10" fill="none" stroke="#8d939a" stroke-width="3" stroke-dasharray="3 3"/>',
  '<circle cx="0" cy="-8" r="8" fill="#1a1714"/><circle cx="-3" cy="-11" r="2.2" fill="#fff"/>'][k];
const findAt = (k, x, y, s = 1, r = 0) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">${findSvg(k)}</g>`;

/* flat contact-shadow colour: a slightly darker tone of the surface under the character (no transparency, no blur) */
const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, '0')).join('');
const SHELF_SHADOW = shade('#d6bc92', .1);
function surfaceShadow() { if (!g || !S) return SHELF_SHADOW; return g.ground < GROUND - 1 ? shade(optOf('cloth', st.home.cloth).body, .13) : SHELF_SHADOW; }
function sky(h) {
  if (h >= 6 && h < 10) return { bg: '#f6d9b8', sun: ['#ff9447', 20] };
  if (h >= 10 && h < 17) return { bg: '#f8eed9', sun: ['#ff6600', 17] };
  if (h >= 17 && h < 20) return { bg: '#f4a97a', sun: ['#d94e00', 24] };
  return { bg: '#2c2723', moon: true };
}
const portraitCache = {};
function portrait() {
  const k = st.type; if (portraitCache[k]) return portraitCache[k];
  const oU = UID, oI = IDP, oS = SHADOW; IDP = 'pf_'; UID = 0; SHADOW = '#e0cfb2'; const svg = layersSVG(renderAction(st.type, 'happy', .9, {})); IDP = oI; UID = oU; SHADOW = oS;
  return (portraitCache[k] = svg);
}
function plantSvg(dayN) {
  const L = dayN < 3 ? 0 : dayN < 7 ? 1 : 2, leaf = (x, y, r, s, c) => `<ellipse cx="${x}" cy="${y}" rx="${9 * s}" ry="${4.5 * s}" transform="rotate(${r} ${x} ${y})" fill="${c}"/>`;
  let s = `<path d="M0 -20 V${-34 - L * 12}" stroke="#1a1714" stroke-width="3" stroke-linecap="round"/>`;
  s += leaf(-8, -30 - L * 4, -30, 1, '#ff9447') + leaf(8, -34 - L * 4, 30, 1, '#ff6600');
  if (L >= 1) s += leaf(-9, -44, -35, 1.1, '#ff6600') + leaf(9, -48, 35, 1.1, '#ff9447');
  if (L >= 2) s += leaf(-7, -58, -40, 1.2, '#ff9447') + leaf(7, -62, 40, 1.2, '#ff6600') + `<circle cx="0" cy="-72" r="6" fill="#fff5e6"/><circle cx="0" cy="-72" r="2.6" fill="#ff6600"/>`;
  return `${s}<path d="M-20 2 L-16 -22 H16 L20 2Z" fill="#1a1714"/><rect x="-18" y="-26" width="36" height="6" rx="3" fill="#ff9447"/>`;
}
const lampSvg = night => `${night ? '<circle cx="0" cy="-48" r="46" fill="#ffc21f" opacity=".22"/>' : ''}<path d="M0 -10 V-38" stroke="#1a1714" stroke-width="4"/><ellipse cx="0" cy="0" rx="15" ry="4.5" fill="#1a1714"/><path d="M-20 -34 L-12 -60 H12 L20 -34Z" fill="${night ? '#ffc21f' : '#ff6600'}"/>`;
const booksSvg = () => `<rect x="-24" y="-12" width="48" height="12" rx="3" fill="#1a1714"/><rect x="-20" y="-24" width="40" height="12" rx="3" fill="#ff6600"/><rect x="-16" y="-35" width="32" height="11" rx="3" fill="#fff5e6"/>`;
/* each character's own small object, drawn on the shelf once the first ritual is done */
function personalSvg(t) {
  const W5 = (d, f, extra = '') => `<path d="${d}" fill="${f}" ${extra}/>`;
  if (t === 'mori') return `<path d="M-14 0 L2 -30" stroke="#1a1714" stroke-width="6" stroke-linecap="round"/><circle cx="8" cy="-44" r="13" fill="#fff5e6" stroke="#1a1714" stroke-width="5"/><ellipse cx="4" cy="-49" rx="5" ry="3" fill="#fff" opacity=".9" transform="rotate(-30 4 -49)"/><path d="M-24 2H8" stroke="#1a1714" stroke-width="5" stroke-linecap="round"/>`;
  if (t === 'nori') return W5('M-24 0 V-12 Q-24 -16 -20 -16 H20 Q24 -16 24 -12 V0Z', '#fff5e6') + W5('M-20 -16 V-26 Q-20 -30 -16 -30 H16 Q20 -30 20 -26 V-16Z', '#ff9447') + W5('M-16 -30 V-39 Q-16 -42 -13 -42 H13 Q16 -42 16 -39 V-30Z', '#fff5e6') + '<path d="M-20 -8H20" stroke="#ff6600" stroke-width="3" stroke-linecap="round"/>';
  if (t === 'pip') return `<circle cx="0" cy="-17" r="16" fill="#ff6600"/><path d="M-15 -13 Q0 -3 15 -13" fill="none" stroke="#fff5e6" stroke-width="4"/><ellipse cx="-6" cy="-24" rx="5" ry="3" fill="#ffdfb7" transform="rotate(-30 -6 -24)"/>`;
  if (t === 'rolo') return W5('M-30 0 Q-34 -12 -26 -24 Q0 -32 26 -24 Q34 -12 30 0Z', '#fff5e6') + '<circle cx="0" cy="-17" r="4" fill="#ff6600"/><path d="M-20 -8Q0 -2 20 -8" fill="none" stroke="#d8c9b1" stroke-width="3"/>';
  return `<rect x="-13" y="-39" width="26" height="36" rx="7" fill="#f8eed9"/><rect x="-14" y="-50" width="28" height="11" rx="4" fill="#1a1714"/><circle cx="-4" cy="-8" r="6" fill="#cdbfae"/><circle cx="6" cy="-10" r="5" fill="#b9a891"/><circle cx="0" cy="-18" r="5" fill="#cdbfae"/>`;
}
function boardSvg() {
  const notes = st.ideas.slice(-4), pos = [[10, 10, -3], [54, 8, 4], [14, 44, 3], [56, 46, -4]], col = ['#ff9447', '#fff5e6', '#ffc09a', '#fff5e6'];
  let s = `<rect width="116" height="84" rx="7" fill="#b89a70"/><rect x="5" y="5" width="106" height="74" rx="4" fill="#e8d6b6"/>`;
  if (!notes.length) s += `<rect x="30" y="26" width="56" height="32" rx="4" fill="none" stroke="#9d8260" stroke-width="2.5" stroke-dasharray="5 4"/><path d="M58 34v16M50 42h16" stroke="#9d8260" stroke-width="2.5" stroke-linecap="round"/>`;
  notes.forEach((n, i) => { const [x, y, r] = pos[i]; s += `<g transform="translate(${x + 14} ${y + 12}) rotate(${r})"><rect x="-14" y="-12" width="40" height="32" rx="2" fill="${col[i % 4]}"/><path d="M-8 -2H18M-8 5H12M-8 12H16" stroke="#1a1714" stroke-width="2" stroke-linecap="round" opacity=".55"/></g>`; });
  return s;
}
const DECO_SIZE = { window: [128, 128], poster: [86, 114], flags: [166, 40], board: [124, 92], clock: [92, 92], xmr: [112, 96], xmrf: [230, 92] };

/* ---------- xmr chart: a small string-and-pins graph. The numbers come only from priceProvider and never touch the grain's mood ---------- */
const PRICE_KEY = 'grainpet.price', PRICE_MODE = DEV ? (QS.get('price') || 'demo') : '';   /* ?review=1&price=demo|stale|loading|error : labelled demo fixtures, review mode only */
const finite = a => Array.isArray(a) && a.length >= 2 && a.length <= 400 && a.every(Number.isFinite);
function sanitizePrice(d) {
  if (!d || !Number.isFinite(d.usd) || !Number.isFinite(d.updated) || !finite(d.h24)) return null;
  const h24 = d.h24.slice(-48), d7 = finite(d.d7) ? d.d7.slice(-200) : null, pct = (a, b) => (b - a) / a * 100;
  return { usd: d.usd, change24h: Number.isFinite(d.change24h) ? d.change24h : pct(h24[0], h24[h24.length - 1]), change7d: Number.isFinite(d.change7d) ? d.change7d : d7 ? pct(d7[0], d7[d7.length - 1]) : null, updated: d.updated, source: String(d.source || '').slice(0, 60), sourceUrl: /^https:\/\/[^\s"'<>]+$/.test(String(d.sourceUrl || '')) ? String(d.sourceUrl).slice(0, 200) : '', demo: !!d.demo, h24, d7: d7 || h24 };
}
function demoSeries(n, seed, drift) { let v = 160, x = seed; const out = []; for (let i = 0; i < n; i++) { x = (x * 9301 + 49297) % 233280; v += (x / 233280 - .5) * 3.2 + drift; out.push(+v.toFixed(2)); } return out; }
function demoData(age) { const h24 = demoSeries(24, 7, .12), d7 = demoSeries(84, 11, .03); d7[d7.length - 1] = h24[h24.length - 1]; const last = h24[h24.length - 1]; return { usd: last, change24h: +(((last - h24[0]) / h24[0]) * 100).toFixed(2), change7d: +(((last - d7[0]) / d7[0]) * 100).toFixed(2), updated: NOW() - age, source: 'demo fixture, not live', sourceUrl: '', demo: true, h24, d7 }; }
/* priceProvider: window.GrainpetPrice = { fetch() -> Promise<{usd, change24h, updated, source, h24[], d7[]}> } registers a real source. Until then: not connected. */
const priceProvider = {
  data: null, status: 'notconnected', lastTry: 0,
  /* on entering the room: show the last good reading at once (stale until proven fresh), then ask for a new one */
  load() {
    let cached = null; try { cached = sanitizePrice(JSON.parse(localStorage.getItem(PRICE_KEY))); } catch {}
    if (PRICE_MODE === 'loading') { this.status = 'loading'; return; }
    if (PRICE_MODE === 'demo') { this.data = demoData(90000); this.status = 'live'; return; }
    if (PRICE_MODE === 'stale') { this.data = demoData(5 * HOUR); this.status = 'stale'; return; }
    if (PRICE_MODE === 'error') { this.data = null; this.status = 'error'; return; }
    if (PRICE_MODE === 'none') { this.data = null; this.status = 'notconnected'; return; }
    const ext = window.GrainpetPrice;
    if (!ext || typeof ext.fetch !== 'function') { this.data = cached; this.status = cached ? 'stale' : 'notconnected'; return; }
    this.data = cached; this.status = cached ? 'stale' : 'loading'; this.refresh(true);
  },
  /* background refresh: at most once every 3 minutes, never while the tab is hidden; a failure keeps the last good reading as stale */
  refresh(force) {
    const ext = window.GrainpetPrice; if (PRICE_MODE || !ext || typeof ext.fetch !== 'function' || document.hidden) return;
    const now = Date.now(); if (!force && now - this.lastTry < 180000) return; this.lastTry = now;
    Promise.resolve().then(() => ext.fetch()).then(d => { const ok = sanitizePrice(d); if (!ok) throw 0; this.data = ok; this.status = 'live'; try { localStorage.setItem(PRICE_KEY, JSON.stringify(ok)); } catch {} if (st) fitView(); })
      .catch(() => { this.status = this.data ? 'stale' : 'error'; if (st) fitView(); });
  },
  /* review only: a labelled demo reading moves, so the flap can be watched (never reachable in the normal experience) */
  demoSet(usd) { if (!DEV || PRICE_MODE !== 'demo' || !this.data) return; const d = this.data; d.usd = +usd.toFixed(2); d.h24 = [...d.h24.slice(1), d.usd]; d.d7 = [...d.d7.slice(1), d.usd]; d.change24h = +(((d.usd - d.h24[0]) / d.h24[0]) * 100).toFixed(2); d.change7d = +(((d.usd - d.d7[0]) / d.d7[0]) * 100).toFixed(2); d.updated = NOW(); this.status = 'live'; },
  view() { const d = this.data; let status = this.status; if (status === 'live' && d && NOW() - d.updated > 20 * 60000) status = 'stale'; return { status, d }; },
};
const fmtUsd = v => '$' + v.toFixed(2), fmtPct = v => (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(1) + '%';
/* the chart exists in the room only when a price source is connected (a real provider, a cached real reading, or a labelled demo in review mode) */
function xmrAvailable() { return priceProvider.status !== 'notconnected'; }
const fmtWhen = t => { const d = new Date(t), n = new Date(NOW()), hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === n.toDateString() ? hm : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + hm; };
/* the string: a single orange thread pulled between pins, ending in a small orange head. p = how much of it is drawn (loading) */
function stringGraph(series, x0, y0, w, h, { p = 1, dim = false, pins = 7 } = {}) {
  const mn = Math.min(...series), mx = Math.max(...series), r = (mx - mn) || 1, n = Math.min(pins, series.length), pts = [];
  for (let i = 0; i < n; i++) { const k = Math.round(i * (series.length - 1) / (n - 1)); pts.push([x0 + w * i / (n - 1), y0 + h - h * (series[k] - mn) / r]); }
  const d = 'M' + pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L'), col = dim ? '#e0a47a' : '#ff6600', last = pts[pts.length - 1];
  const vis = p >= 1 ? '' : ` stroke-dasharray="${Math.max(.001, p).toFixed(3)} 2"`;
  return `<g opacity="${dim ? .6 : 1}"><path d="${d}" pathLength="1" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${vis}/>${pts.map((q, i) => i < n - 1 ? `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.1" fill="#5d5246"/>` : '').join('')}${p >= .98 ? `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4.6" fill="#d94e00"/><circle cx="${last[0].toFixed(1)}" cy="${(last[1] - .6).toFixed(1)}" r="3.8" fill="${col}"/><circle cx="${(last[0] - 1.1).toFixed(1)}" cy="${(last[1] - 1.8).toFixed(1)}" r="1.1" fill="#fff0dc"/>` : ''}</g>`;
}
const slackString = (x0, y0, w, h) => `<path d="M${x0} ${y0 + 6} Q${x0 + w / 2} ${y0 + h} ${x0 + w} ${y0 + 6}" fill="none" stroke="#d9b898" stroke-width="2.2" stroke-linecap="round"/><circle cx="${x0}" cy="${y0 + 6}" r="2.2" fill="#5d5246"/><circle cx="${x0 + w}" cy="${y0 + 6}" r="2.2" fill="#5d5246"/>`;
/* a wooden frame, one orange thread between pins, and a split-flap price plate that turns over when the number changes */
const FLAP = { str: null, prev: '', t0: -9, sawLoading: false };
/* split-flap: the fold line sits behind the digit so it never cuts it; only the cells whose digit changed turn over */
function flapRow(str, x, y, w, ch, flipOn, dim) {
  const chars = [...str], gap = 2.2, units = chars.reduce((a, c) => a + (c === '.' ? .5 : 1), 0), cw = Math.min(15, (w - gap * (chars.length - 1)) / units), fs = Math.min(22, cw * 1.55), off = chars.length - FLAP.prev.length;
  let cx = x + (w - (cw * units + gap * (chars.length - 1))) / 2, s = '';
  chars.forEach((c, i) => {
    const wc = c === '.' ? cw * .5 : cw; let sy = 1, shown = c;
    if (flipOn) { const pv = FLAP.prev[i - off] || ' ', p = Math.max(0, Math.min(1, (T - FLAP.t0 - i * .09) / .38)); if (p < 1 && pv !== c) { sy = Math.max(.08, Math.abs(Math.cos(p * Math.PI))); shown = p < .5 ? pv : c; } }
    s += `<g transform="translate(${cx.toFixed(1)} ${(y + ch / 2).toFixed(1)}) scale(1 ${sy.toFixed(3)}) translate(0 ${(-ch / 2).toFixed(1)})"><rect width="${wc.toFixed(1)}" height="${ch}" rx="2.5" fill="#2b2521"/><path d="M0 ${ch / 2} V2.5 Q0 0 2.5 0 H${(wc - 2.5).toFixed(1)} Q${wc.toFixed(1)} 0 ${wc.toFixed(1)} 2.5 V${ch / 2}Z" fill="#3a322b"/><rect x="0" y="${ch / 2 - .45}" width="${wc.toFixed(1)}" height=".9" fill="#14110f" opacity=".7"/><circle cx="1.3" cy="${ch / 2}" r="1" fill="#7a6a55"/><circle cx="${(wc - 1.3).toFixed(1)}" cy="${ch / 2}" r="1" fill="#7a6a55"/>${shown.trim() ? `<text x="${(wc / 2).toFixed(1)}" y="${(ch / 2 + fs * .36).toFixed(1)}" text-anchor="middle" font-family="Albert Sans, sans-serif" font-weight="800" font-size="${fs.toFixed(1)}" fill="#f6ead5">${ESC(shown)}</text>` : ''}</g>`;
    cx += wc + gap;
  });
  return `<g opacity="${dim ? .55 : 1}">${s}</g>`;
}
/* the Monero mark: an orange disc with the M, so a bare price never reads as a clock or a calculator */
const xmrMark = (cx, cy, r, dim) => `<g opacity="${dim ? .6 : 1}"><circle cx="${cx}" cy="${cy + 1.2}" r="${r}" fill="#d94e00"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ff6600"/><path d="M${cx - r * .42} ${cy + r * .4} V${cy - r * .38} L${cx} ${cy + r * .08} L${cx + r * .42} ${cy - r * .38} V${cy + r * .4}" fill="none" stroke="#fff0dc" stroke-width="${(r * .26).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
function xmrCard(big) {
  const { status, d } = priceProvider.view(), ok = (status === 'live' || status === 'stale') && d, dim = status === 'stale', W = big ? 230 : 112, H = big ? 92 : 96;
  const tx = (x, y, t, o = '') => `<text x="${x}" y="${y}" ${o} font-family="Albert Sans, sans-serif" ${/font-weight/.test(o) ? '' : 'font-weight="700"'} letter-spacing="-.2">${ESC(t)}</text>`;
  let s = `<rect x="0" y="5" width="${W}" height="${H - 5}" rx="10" fill="#7a5c38"/><rect x="0" y="0" width="${W}" height="${H - 5}" rx="10" fill="#a98a60"/><rect x="6" y="6" width="${W - 12}" height="${H - 17}" rx="6" fill="#f6ead5"/>`;
  let str = '       ';
  if (ok) {
    const v = d.usd; str = '$' + (v >= 1000 ? v.toFixed(0) : v.toFixed(2));
    if (FLAP.str === null) { FLAP.str = str; FLAP.prev = FLAP.sawLoading ? ' '.repeat(str.length) : str; FLAP.t0 = T; }   /* arrival after loading turns every cell once; a first reading shown at once does not */
    else if (str !== FLAP.str) { FLAP.prev = FLAP.str; FLAP.str = str; FLAP.t0 = T; }   /* a new price turns only the cells that changed; the same price turns nothing */
  } else if (status === 'loading') FLAP.sawLoading = true;
  const gx = big ? 15 : 36, gy = big ? 10 : 14, gw = W - gx - 15, gh = big ? 22 : 28, plateX = big ? 100 : 8, plateW = big ? 118 : 96, plateY = big ? 36 : 50, plateH = big ? 28 : 38;
  if (ok) s += stringGraph(d.h24, gx, gy, gw, gh, { dim, pins: big ? 9 : 5 });
  else if (status === 'loading') s += stringGraph(Array.from({ length: 12 }, (_, i) => Math.sin(i * .7) + i * .12), gx, gy, gw, gh, { p: Math.min(1, (T % 3.2) / 2.2) });
  else s += slackString(gx, gy + 4, gw, gh - 6);
  if (!big) s += xmrMark(21, 29, 10.5, dim);
  s += `<rect x="${plateX}" y="${plateY}" width="${plateW}" height="${plateH}" rx="5" fill="#4a3d2f"/><rect x="${plateX}" y="${plateY + plateH - 3}" width="${plateW}" height="3" rx="1.5" fill="#33291f"/>` + flapRow(str, plateX + 4, plateY + 4, plateW - 8, plateH - 8, ok, dim);
  if (big) {
    s += tx(16, 53, 'xmr / usd', 'font-size="17" fill="#5d5246"');
    if (ok) s += tx(16, 76, fmtPct(d.change24h) + ' · 24h', `font-size="16.5" fill="${dim ? '#7a6a55' : '#1a1714'}"`);
    else if (status === 'loading') s += tx(16, 76, 'loading', 'font-size="16.5" fill="#9b8868"');
    else s += tx(16, 76, status === 'error' ? 'price unavailable' : 'not connected', 'font-size="16.5" fill="#5d5246"');
  }
  return s;
}
function decoInner(id, h, min) {
  if (id === 'xmr') return xmrCard(false);
  if (id === 'xmrf') return xmrCard(true);
  if (id === 'window') { const k = sky(h); let s = `<rect x="4" y="2" width="116" height="116" rx="16" fill="#fff"/><rect x="13" y="11" width="98" height="98" rx="9" fill="${k.bg}"/>`;
    if (k.moon) s += `<circle cx="74" cy="42" r="15" fill="#fff5e6"/><circle cx="81" cy="37" r="13" fill="${k.bg}"/><circle cx="32" cy="32" r="2" fill="#fff5e6"/><circle cx="48" cy="68" r="1.8" fill="#fff5e6"/><circle cx="88" cy="84" r="2.2" fill="#fff5e6"/><circle cx="28" cy="86" r="1.6" fill="#fff5e6"/>`;
    else s += `<circle cx="${h < 17 ? 78 : 58}" cy="${h < 10 ? 74 : h < 17 ? 38 : 80}" r="${k.sun[1]}" fill="${k.sun[0]}"/>`;
    return s + `<path d="M62 11v98M13 60h98" stroke="#fff" stroke-width="6"/><rect x="0" y="116" width="128" height="10" rx="5" fill="#fff"/>`; }
  if (id === 'poster') { const t = (y, s, w) => `<text x="40" y="${y}" text-anchor="middle" font-family="Albert Sans, sans-serif" font-weight="800" font-size="${s}" letter-spacing="-.6" style="fill:#fff5e6">${w}</text>`; return `<g transform="rotate(-2 43 57)"><rect x="0" y="4" width="86" height="110" rx="8" fill="#c9b08c"/><g transform="translate(3 3)"><rect width="80" height="108" rx="5" fill="#ff6600"/>${t(32, 19, 'ideas')}${t(56, 15, 'into')}${t(82, 14.5, 'existence')}</g></g>`; }
  if (id === 'flags') { let s = `<path d="M0 6 Q83 40 166 6" fill="none" stroke="#1a1714" stroke-width="2.5"/>`; const cols = ['#ff6600', '#fff5e6', '#1a1714', '#ff9447', '#fff5e6'];
    for (let i = 0; i < 5; i++) { const t = .1 + i * .2, x = t * 166, y = 2 * t * (1 - t) * 34 + 6; s += `<path d="M${(x - 11).toFixed(1)} ${(y - 1).toFixed(1)} L${(x + 11).toFixed(1)} ${(y - 1).toFixed(1)} L${x.toFixed(1)} ${(y + 24).toFixed(1)}Z" fill="${cols[i]}"/>`; } return s; }
  if (id === 'board') return boardSvg();
  if (id === 'clock') { const hr = ((h % 12) + min / 60) * 30, mn = min * 6; return `<circle cx="46" cy="49" r="45" fill="#a98a60"/><circle cx="46" cy="46" r="45" fill="#c9b08c"/><circle cx="46" cy="46" r="39" fill="#fff5e6"/>${[0, 90, 180, 270].map(a => `<path d="M46 12v6" stroke="#1a1714" stroke-width="3" stroke-linecap="round" transform="rotate(${a} 46 46)"/>`).join('')}<path d="M46 46V28" stroke="#1a1714" stroke-width="4.5" stroke-linecap="round" transform="rotate(${hr} 46 46)"/><path d="M46 46V18" stroke="#ff6600" stroke-width="3.5" stroke-linecap="round" transform="rotate(${mn} 46 46)"/><circle cx="46" cy="46" r="4" fill="#1a1714"/>`; }
  return '';
}
/* fixed places on the wall. The window, the notebook, the finds shelf and the floor shelf are anchors; memory frames and wall art arrange around them in a few
   planned compositions per breakpoint ('n' narrow/phone, 'w' wide/desktop). Never free placement, never overlapping. row 1 / row 2 follow the wall height. */
const SLOT_META = { win: { kind: 'win' }, hero: { kind: 'frame', shape: 'rect' }, s1: { kind: 'frame', shape: 'round' }, s2: { kind: 'frame', shape: 'arch' }, notebook: { kind: 'notes' }, finds: { kind: 'finds' }, decoA: { kind: 'deco' }, decoB: { kind: 'deco' } };
const LAYOUTS = {
  n: [
    { name: 'gallery', win: [20, 60, 112, 126, 1], hero: [148, 62, 124, 124, 1], s1: [288, 62, 56, 68, 1], s2: [356, 62, 56, 68, 1], notebook: [432, 62, 60, 82, 1], decoA: [20, 202, 118, 96, 2], finds: [150, 232, 200, 46, 2], decoB: [362, 202, 130, 96, 2],
      xf: { decoA: [20, 196, 230, 92, 2], finds: [262, 232, 230, 46, 2], decoB: null } },
    { name: 'mirror', notebook: [20, 62, 60, 82, 1], hero: [98, 62, 124, 124, 1], win: [238, 60, 112, 126, 1], s1: [366, 62, 56, 68, 1], s2: [434, 62, 56, 68, 1], decoB: [20, 202, 130, 96, 2], finds: [162, 232, 200, 46, 2], decoA: [374, 202, 118, 96, 2],
      xf: { decoA: [262, 196, 230, 92, 2], finds: [20, 232, 230, 46, 2], decoB: null } },
    { name: 'corner', hero: [20, 62, 124, 124, 1], win: [160, 60, 112, 126, 1], decoA: [290, 62, 112, 96, 1], notebook: [424, 62, 60, 82, 1], s1: [20, 206, 56, 68, 2], s2: [88, 206, 56, 68, 2], finds: [160, 232, 200, 46, 2], decoB: [372, 202, 120, 96, 2],
      xf: { s1: [290, 62, 56, 68, 1], s2: [358, 62, 56, 68, 1], finds: [20, 232, 200, 46, 2], decoA: [236, 196, 256, 92, 2], decoB: null } },
  ],
  w: [
    { name: 'gallery', win: [-56, 60, 112, 126, 1], hero: [72, 62, 124, 124, 1], s1: [212, 62, 56, 68, 1], s2: [280, 62, 56, 68, 1], notebook: [352, 62, 60, 82, 1], decoA: [432, 62, 136, 96, 1], decoB: [-56, 202, 136, 96, 2], finds: [368, 232, 200, 46, 2],
      xf: { finds: [-56, 232, 200, 46, 2], decoA: [176, 196, 250, 92, 2], decoB: null } },
    { name: 'mirror', notebook: [-56, 62, 60, 82, 1], hero: [24, 62, 124, 124, 1], s1: [164, 62, 56, 68, 1], s2: [232, 62, 56, 68, 1], win: [308, 62, 112, 126, 1], decoA: [438, 62, 130, 96, 1], finds: [-56, 232, 200, 46, 2], decoB: [432, 202, 136, 96, 2],
      xf: { decoA: [176, 196, 250, 92, 2], decoB: null } },
    { name: 'corner', win: [-56, 60, 112, 126, 1], s1: [80, 62, 56, 68, 1], s2: [148, 62, 56, 68, 1], hero: [222, 62, 124, 124, 1], notebook: [366, 62, 60, 82, 1], decoA: [446, 62, 122, 96, 1], decoB: [-56, 202, 136, 96, 2], finds: [368, 232, 200, 46, 2],
      xf: { finds: [-56, 232, 200, 46, 2], decoA: [176, 196, 250, 92, 2], decoB: null } },
  ],
};
const SLOTS = {}; let LAYOUT_BP = 'n';
function applyLayout(bp, comp) {
  LAYOUT_BP = bp; const hasSt = typeof st !== 'undefined' && st, base = LAYOUTS[bp][comp !== undefined ? comp : (hasSt ? st.home.comp : 0)] || LAYOUTS[bp][0];
  const feat = hasSt && st.home.decoA === 'xmrf' && xmrAvailable(), L = feat ? { ...base, ...base.xf } : base;   /* the large chart takes the middle of the lower wall: finds shelf moves aside, the second wall-art slot rests */
  for (const k of Object.keys(SLOT_META)) { const q = L[k]; SLOTS[k] = q ? { x: q[0], y: q[1], w: q[2], h: q[3], row: q[4], ...SLOT_META[k] } : { x: 0, y: 0, w: 0, h: 0, row: -1, hidden: true, ...SLOT_META[k] }; }
  SLOTS.shelf = { x: 448, y: GROUND - 96, w: 62, h: 96, row: 0, kind: 'shelf' };
}
applyLayout('n', 0);
function decoAt(id, slot, h, min) {
  const [nw, nh] = DECO_SIZE[id], k = Math.min(slot.w / nw, slot.h / nh, 1.05), x = slot.x + (slot.w - nw * k) / 2, y = id === 'flags' ? slot.y : slot.y + (slot.h - nh * k) / 2;
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})">${decoInner(id, h, min)}</g>`;
}
/* what a memory frame shows: a small scene, never a label */
function vignette(id, cx, cy, k) {
  const ground = `<path d="M${cx - 26 * k} ${cy + 30 * k}H${cx + 26 * k}" stroke="#c9b08c" stroke-width="${3 * k}" stroke-linecap="round"/>`;
  if (id === 'meeting') return `<g transform="translate(${cx} ${cy + 32 * k}) scale(${.13 * k})">${portrait()}</g>${heart(cx + 20 * k, cy - 22 * k, .34 * k)}`;
  if (id === 'ritual') { const cloth = st.type === 'nori' || st.type === 'rolo'; return ground + (cloth ? `<g transform="translate(${cx} ${cy + 24 * k}) scale(${.34 * k})">${mat(0, 0, 120, 0)}</g>` : `<g transform="translate(${cx} ${cy + 20 * k}) scale(${.5 * k})">${pebble(0, 0, 22, 12)}</g>`) + sparkle(cx + 14 * k, cy - 8 * k, 1.1 * k) + sparkle(cx - 16 * k, cy - 20 * k, .7 * k); }
  if (id === 'find') { const f = st.finds.got[0]; return ground + findAt(f === undefined ? 0 : f, cx, cy + 28 * k, 1.9 * k); }
  return `<g transform="translate(${cx} ${cy}) scale(${k})"><rect x="-14" y="-21" width="28" height="40" rx="3" fill="#ff6600"/><rect x="-14" y="-21" width="6" height="40" fill="#1a1714" opacity=".5"/><path d="M-3 -10H10M-3 -3H10M-3 4H6" stroke="#fff5e6" stroke-width="2.4" stroke-linecap="round"/><path d="M6 19v9l3-3 3 3v-9" fill="#fff5e6"/></g>`;
}
function frameAt(slotKey, id) {
  const r = SLOTS[slotKey], cx = r.x + r.w / 2, cy = r.y + r.h / 2, k = slotKey === 'hero' ? 1.35 : .85;
  let body;
  if (r.shape === 'round') { const R = Math.min(r.w, r.h) / 2 + 2; body = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#1a1714"/><circle cx="${cx}" cy="${cy}" r="${R - 9}" fill="#f6ead7"/>`; }
  else if (r.shape === 'arch') { const a = (x, y, w, h, c) => `<path d="M${x} ${y + h} V${y + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} V${y + h} Z" fill="${c}"/>`; body = a(r.x + 1, r.y + 1, r.w - 2, r.h - 2, '#1a1714') + a(r.x + 6, r.y + 6, r.w - 12, r.h - 12, '#f6ead7'); }
  else body = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="9" fill="#1a1714"/><rect x="${r.x + 7}" y="${r.y + 7}" width="${r.w - 14}" height="${r.h - 14}" rx="4" fill="#f6ead7"/>`;
  return body + vignette(id, cx, cy - (slotKey === 'hero' ? 4 : 2), k);
}
function notebookSvg(unread) {
  const r = SLOTS.notebook, fx = S && S.fx ? S.fx.nb : null, ph = fx ? Math.max(0, 1 - Math.abs((T - fx) - .35) / .35) : 0;
  const open = Math.min(1, (unread ? .1 + .05 * Math.sin(T * 2.2) : 0) + ph);   /* unread: ajar, a corner of paper shows. tapped: the cover swings open a little */
  const cover = `<g transform="scale(${(1 - .24 * open).toFixed(3)} 1)"><rect width="60" height="82" rx="6" fill="#ff6600"/><rect width="10" height="82" rx="4" fill="#d94e00"/><rect x="20" y="16" width="30" height="5" rx="2.5" fill="#fff5e6"/><rect x="20" y="28" width="22" height="5" rx="2.5" fill="#fff5e6" opacity=".8"/><circle cx="35" cy="56" r="7" fill="#fff5e6"/><circle cx="32.5" cy="55" r="1.6" fill="#1a1714"/><circle cx="38" cy="55" r="1.6" fill="#1a1714"/></g>`;
  return `<g transform="translate(${r.x} ${r.y})"><rect x="2" y="3" width="58" height="78" rx="5" fill="#fff5e6"/><path d="M${44 + 6 * open} 18h10M${44 + 6 * open} 28h10M${44 + 6 * open} 38h6" stroke="#d3bf9c" stroke-width="2.4" stroke-linecap="round" opacity="${(open * 1.4).toFixed(2)}"/>${cover}<path d="M48 82v12l4-4 4 4V82" fill="#fff5e6"/></g>`;
}
function matSvg(w, rot, v) { return `<g transform="translate(0 4) rotate(${rot})" data-role="prop"><rect x="${-w / 2}" y="-6" width="${w}" height="18" rx="9" fill="#c9b592"/><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="9" fill="${v.body}"/><rect x="${-w / 2 + 14}" y="-2" width="${w - 28}" height="5" rx="2.5" fill="${v.stripe}" opacity=".85"/></g>`; }
function plateSvg(v) { return `<ellipse cx="3" cy="6" rx="63" ry="9" ${(BLEND_OK && !SHADOW_SOLID) ? `fill="${SHADOW_MULTIPLY}" fill-opacity="${SHADOW_ALPHA}" style="mix-blend-mode:multiply"` : `fill="#c2a47a"`}/><ellipse cx="0" cy="3" rx="58" ry="13.5" fill="${v.c}"/><ellipse cx="0" cy="-0.5" rx="58" ry="13.5" fill="${v.a}"/><ellipse cx="0" cy="0.5" rx="43" ry="8.8" fill="${v.b}"/><path d="M-50 -6 Q-30 -13 -8 -12.5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/><path d="M-40 2 Q-10 8 28 6" fill="none" stroke="#000" stroke-opacity=".08" stroke-width="3" stroke-linecap="round"/>`; }
const NAMEPLATE = { x: W / 2, y: GROUND + 33 };
function namePlateSvg(np) {
  const nm = ESC(st.name.slice(0, 14)), pw = Math.max(96, nm.length * 11.5 + 36);
  return `<g transform="translate(${NAMEPLATE.x} ${NAMEPLATE.y})"><rect x="${-pw / 2}" y="-10" width="${pw}" height="24" rx="8" fill="#b89a70"/><rect x="${-pw / 2}" y="-12" width="${pw}" height="24" rx="8" fill="${np.bg}"/><text x="0" y="5.5" text-anchor="middle" font-family="Albert Sans, sans-serif" font-weight="800" font-size="16" letter-spacing="-.4" style="fill:${np.fg}">${nm}</text></g>`;
}
function shelfObjSvg(so, night) {
  if (so === 'plant') return `<g transform="translate(486 ${GROUND})">${plantSvg(day())}</g>`; if (so === 'lamp') return `<g transform="translate(486 ${GROUND})">${lampSvg(night)}</g>`;
  if (so === 'books') return `<g transform="translate(484 ${GROUND})">${booksSvg()}</g>`; if (so === 'personal') return `<g transform="translate(486 ${GROUND})">${personalSvg(st.type)}</g>`; return '';
}
/* in-world feedback: a new item drops into its place with a small bounce, a frame glints once */
function fxIn(k, inner) { const t0 = S && S.fx ? S.fx[k] : null; if (t0 === null || t0 === undefined) return inner; const u = (T - t0) / .5; if (u >= 1 || u < 0) return inner; const dy = -26 * (1 - u) * (1 - u) * Math.cos(u * 7) * (1 - u * .3), sc = 1 + .05 * Math.sin(u * Math.PI); const c = (SLOTS[k].x + SLOTS[k].w / 2).toFixed(1), cy = (SLOTS[k].y + SLOTS[k].h / 2).toFixed(1); const tilt = k.startsWith('deco') && String(st.home[k]).startsWith('xmr') ? 11 * (1 - u) * (1 - u) * Math.cos(u * 9) : 0;   /* a hung chart swings and settles straight */
  return `<g transform="translate(0 ${dy.toFixed(1)}) translate(${c} ${cy}) rotate(${tilt.toFixed(2)}) scale(${sc.toFixed(3)}) translate(-${c} -${cy})">${inner}</g>`; }
function glintAt(k, r) { const t0 = S && S.fx ? S.fx['g' + k] : null; if (t0 === null || t0 === undefined) return ''; const u = (T - t0) / .9; if (u < 0 || u > 1) return ''; return sparkle(r.x + r.w - 8, r.y + 10, 1.1 * Math.sin(u * Math.PI), 1); }
function homeSvg(live, hour, min, edit) {
  const now = new Date(NOW()), h = hour === undefined ? now.getHours() : hour, mi = min === undefined ? now.getMinutes() : min;
  const w = optOf('wall', st.home.wall), cl = optOf('cloth', st.home.cloth), bw = optOf('bowl', st.home.bowl), hide = live ? S.hide : {}, night = h >= 20 || h < 6, hm = st.home;
  let s = `<rect x="-800" y="-700" width="2112" height="1400" fill="${w.c}"/><circle cx="70" cy="70" r="170" fill="${w.glow}" opacity=".7"/>`;
  const dec = (slot, key) => { if (key && CAT.deco.opts[key] && CAT.deco.opts[key].need()) s += decoAt(key, SLOTS[slot], h, mi); };
  const rowSlots = row => Object.entries(SLOTS).filter(([, r]) => r.row === row);
  const wallRow = row => {
    s += `<g transform="translate(0 ${row === 1 ? wallShift : wallShift2})">`;
    for (const [k, r] of rowSlots(row)) {
      if (k === 'win') s += decoAt('window', r, h, mi);
      else if (k === 'decoA' || k === 'decoB') { const n0 = s.length; dec(k, hm[k]); if (S && S.fx && S.fx[k] && s.length > n0) { const inner = s.slice(n0); s = s.slice(0, n0) + fxIn(k, inner); } }
      else if (r.kind === 'frame') { if (hm.frames[k] && st.memories[hm.frames[k]]) s += fxIn(k, frameAt(k, hm.frames[k])) + glintAt(k, r); }
      else if (k === 'notebook') { if (NOTES[0].need()) s += notebookSvg(!st.notesRead.includes(NOTES[0].id)); }
      else if (k === 'finds' && st.finds.pending !== null && !st.finds.shown.length) { s += `<rect x="${r.x + 4}" y="${r.y + 36}" width="${r.w - 10}" height="9" rx="4.5" fill="#b89a70"/>`; }
      if (k === 'finds' && st.finds.pending !== null && live) s += sparkle(r.x + r.w / 2 + Math.sin(T * 1.3) * 60, r.y + 26, .9, .5 + .5 * Math.sin(T * 4));
      if (k === 'finds' && st.finds.shown.length) { s += `<rect x="${r.x + 4}" y="${r.y + 36}" width="${r.w - 10}" height="9" rx="4.5" fill="#b89a70"/>`; st.finds.shown.slice(0, Math.max(1, Math.min(5, Math.floor((r.w - 10) / 38)))).forEach((f, i) => { s += findAt(f, r.x + 28 + i * 38, r.y + 36, 1.1, (f * 23) % 40 - 12); }); }
    }
    if (edit) s += editMarks(edit, row);
    s += '</g>';
  };
  wallRow(1); wallRow(2);
  const sh = { top: '#d6bc92', front: '#b89a70', edge: '#9d8260' };
  s += `<rect x="-800" y="${GROUND}" width="2112" height="14" fill="${sh.top}"/><rect x="-800" y="${GROUND + 14}" width="2112" height="34" fill="${sh.front}"/><rect x="-800" y="${GROUND + 48}" width="2112" height="60" fill="${sh.edge}"/>`;
  s += `<path d="M30 ${GROUND + 58} l30 40 h-30z M452 ${GROUND + 58} l30 40 h-30z" fill="${sh.edge}" opacity="0"/>`;
  const np = optOf('plate', hm.plate); if (hm.plate !== 'off' && np.bg) s += namePlateSvg(np);
  if (live) for (let i = 0; i < Math.round(st.dust * 9); i++) { const x = 150 + ((i * 97) % 200); s += `<circle cx="${x}" cy="${GROUND + 5 + (i % 3) * 3}" r="${2 + i % 3}" fill="#f6eee2" opacity=".7"/>`; }
  s += prop(BOWL_X + OB.bowlDx, plateSvg(bw));
  if (live && OB.crumb && !hide.crumb) { const co = OB.crumbOff || { dx: 0, rot: CRUMB_ROT[st.type] }; s += prop(BOWL_X + OB.bowlDx + co.dx, crumb(0, -12 + OB.crumbY / SCL, 14, OB.crumbOff ? co.rot : CRUMB_ROT[st.type])); }
  const so = optOf('shelfObj', hm.shelfObj) === CAT.shelfObj.opts[hm.shelfObj] ? hm.shelfObj : 'none'; s += shelfObjSvg(so, night);
  if (!hide.mat) s += prop(MATX, matSvg(MAT_W[st.type], live ? S.matRot : 0, cl));
  const P = OB.pebble;
  if (live && P.vis && !hide.pebble) s += `<g transform="translate(${P.x.toFixed(1)} ${(GROUND + P.y).toFixed(1)}) scale(${SCL})">${pebble(0, 0, 22, P.rot)}</g>`;
  if (live && OB.find) s += `<g transform="translate(${OB.find.x} ${GROUND + OB.find.y})">${findAt(OB.find.id, 0, 0, 1.5)}</g>`;
  if (edit) s += editMarks(edit, 0);
  return s;
}
/* customise mode shows only the areas of the chosen group, as calm solid shapes: no dashes, no overlap (every slot is its own place) */
function editAreas(cat) {
  const A = (k, filled) => { const r = SLOTS[k]; return { k, x: r.x, y: r.y, w: r.w, h: r.h, row: r.row, filled, hidden: r.hidden }; };
  const hm = st.home, fl = (k, x, y, w, h) => ({ k, x, y, w, h, row: 0, filled: true });
  const frames = ['hero', 's1', 's2'].map(k => A(k, !!hm.frames[k])), arts = ['decoA', 'decoB'].map(k => A(k, !!hm[k]));
  const mat = fl('cloth', MATX - MAT_W[st.type] / 2 - 12, GROUND - 16, MAT_W[st.type] + 24, 34), bowl = fl('bowl', BOWL_X - 70, GROUND - 18, 140, 38), shelf = fl('shelfObj', SLOTS.shelf.x - 4, SLOTS.shelf.y, SLOTS.shelf.w + 8, SLOTS.shelf.h + 4), plate = fl('plate', NAMEPLATE.x - 66, GROUND + 18, 132, 30), finds = A('finds', st.finds.shown.length > 0);
  if (cat === 'frames') return frames; if (cat === 'art') return arts; if (cat === 'finds') return [finds]; if (cat === 'cloth') return [mat]; if (cat === 'bowl') return [bowl]; if (cat === 'shelfObj') return [shelf]; if (cat === 'plate') return [plate];
  if (cat === 'layout') return [...frames, ...arts, finds, A('win', true), A('notebook', true)];
  if (cat === 'wall') return [];
  return [...frames, ...arts, finds];   /* before a group is chosen: only the wall places, nothing on the floor */
}
function editMarks(edit, row) {
  let s = '';
  for (const a of editAreas(edit.cat)) {
    if (a.row !== row || a.hidden) continue;
    const sel = !!edit.cat && edit.sel === a.k;
    s += `<rect x="${a.x - 5}" y="${a.y - 5}" width="${a.w + 10}" height="${a.h + 10}" rx="14" fill="${sel ? '#ff6600' : '#fff'}" fill-opacity="${sel ? .14 : .22}" stroke="${sel ? '#ff6600' : '#1a1714'}" stroke-opacity="${sel ? 1 : .2}" stroke-width="${sel ? 3 : 1.6}"/>`;
    if (!a.filled) s += `<path d="M${a.x + a.w / 2 - 8} ${a.y + a.h / 2}h16M${a.x + a.w / 2} ${a.y + a.h / 2 - 8}v16" stroke="${sel ? '#ff6600' : '#1a1714'}" stroke-opacity="${sel ? 1 : .4}" stroke-width="3.2" stroke-linecap="round"/>`;
  }
  return s;
}
let wallShift = 0, wallShift2 = 0;   /* on a tall screen the wall things rise with the extra wall height, so the room keeps a calm top-to-bottom rhythm */
let EDIT = null;   /* {sel} while the customise sheet is open: slots show and answer taps */
/* a long absence leaves the room a little quieter (cooler, dimmer); it warms up again as the grain recovers. The character stays above it. */
const quietTint = () => { if (!S || EDIT) return ''; const q = [0, .02, .06, .1][S.tier] * (1 - S.rec); return q > .004 ? `<rect x="-800" y="-600" width="2112" height="1800" fill="#5e6c80" opacity="${q.toFixed(3)}" style="mix-blend-mode:multiply" pointer-events="none"/>` : ''; };
const sceneBack = () => homeSvg(true, undefined, undefined, EDIT) + quietTint();

function sceneFront() {
  let s = '';
  for (const p of parts) {
    const a = clamp(p.life, 0, 1);
    if (p.type === 'dust') s += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(4 * p.s * (1.3 - a)).toFixed(1)}" fill="#f8f0e4" opacity="${(a * .8).toFixed(2)}"/>`;
    else if (p.type === 'heart') s += heart(p.x, p.y, .5 * p.s, a);
    else if (p.type === 'spark') s += sparkle(p.x, p.y, .8, a);
    else if (p.type === 'bit') s += `<rect x="${(p.x - 3).toFixed(1)}" y="${(p.y - 3).toFixed(1)}" width="${(6 * p.s).toFixed(1)}" height="${(5 * p.s).toFixed(1)}" rx="1.5" fill="${p.s > 1 ? '#e0903c' : '#f2c27a'}"  opacity="${a.toFixed(2)}" transform="rotate(${(p.x * 9) % 90} ${p.x.toFixed(1)} ${p.y.toFixed(1)})"/>`;
  }
  return s;
}
function render() { gBack.innerHTML = sceneBack(); gFront.innerHTML = sceneFront(); const wl = st.home.wall; if (wl !== lastWall) { lastWall = wl; stageEl.classList.toggle('dark', wl === 'night' && CAT.wall.opts.night.need()); stageEl.style.background = optOf('wall', wl).c; } }
let lastWall = null; const stageEl = $('#stage');
/* the room is never stretched: a taller view shows more wall, a wider view shows more shelf; the character and objects keep their size relative to the room */
/* jump-safe envelope: the grain may never pass through a wall item, not even at the top of a jump. The room is lifted (a little more wall above) and, if still needed, the apex is lowered (JUMPK, never below half). */
const CHARM = {};
function charMetrics() {
  const t = st && st.type; if (!t) return null; if (CHARM[t]) return CHARM[t];
  try {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.style.cssText = 'position:absolute;visibility:hidden'; document.body.append(s);
    const topOf = (id, q, o) => { s.innerHTML = `<g>${renderAction(t, id, q, o).character}</g>`; return GROUND + s.querySelector('[data-layer="character"]').getBBox().y * SCL; };
    const A = ACTIONS[t]; let top = 1e9, hw = 0;
    for (let q = 0; q < A.idle.dur; q += .3) { s.innerHTML = `<g>${renderAction(t, 'idle', q, {}).character}</g>`; const bb = s.querySelector('[data-layer="character"]').getBBox(); top = Math.min(top, GROUND + bb.y * SCL); hw = Math.max(hw, bb.width / 2 * SCL); }
    let ymax = 0, ext = 0;   /* ymax: highest airborne offset in room units; ext: extra reach of the squash-and-stretch above it */
    for (const id of Object.keys(A)) { const a = A[id]; for (const o of [{ dir: 1, dx: 0 }, { dir: -1, dx: 70 }]) for (let q = 0; q <= a.dur; q += .03) { let y = 0; try { y = a.fn(q, o).pose.y || 0; } catch { continue; } if (y > -2) continue; const yu = -y * SCL; ymax = Math.max(ymax, yu); try { ext = Math.max(ext, top - topOf(id, q, o) - yu); } catch {} } }
    s.remove();
    return (CHARM[t] = { top, hw, ymax: Math.max(6, ymax), ext: Math.max(0, ext) });
  } catch { return null; }
}
const wallDrawn = (k, r) => EDIT ? true : k === 'win' ? true : r.kind === 'frame' ? !!(st.home.frames[k] && st.memories[st.home.frames[k]]) : k === 'notebook' ? NOTES[0].need() : k === 'finds' ? (st.finds.shown.length > 0 || st.finds.pending !== null) : (k === 'decoA' || k === 'decoB') ? !!(st.home[k] && CAT.deco.opts[st.home[k]] && CAT.deco.opts[st.home[k]].need()) : false;
function lowestDrawn() { let m = 0; for (const [k, r] of Object.entries(SLOTS)) { if (!r.row || r.hidden || !wallDrawn(k, r)) continue; m = Math.max(m, r.y + r.h + (r.row === 2 ? wallShift2 : wallShift)); } return m; }
function layoutFor(r, a, Hv0, L) {
  const H = Hv0 + L, W = a > 1.05 ? clamp(H * a, 512, 840) : 512; applyLayout(W >= 680 ? 'w' : 'n');
  let s1 = Hv0 > 548 ? -Math.round((Hv0 - 548) * .66) : 0, s2 = Hv0 > 548 ? -Math.round((Hv0 - 548) * .3) : 0; s1 -= L; s2 -= L;
  /* the caption owns the top 44 px of the room: no wall item may enter it, at any height (while customising the caption is off and only 10 px are kept) */
  const k = Math.min(r.width / W, r.height / H), minTop = (548 - H) + (EDIT ? 10 : 46) / k, top1 = Math.min(...Object.values(SLOTS).filter(q => q.row === 1).map(q => q.y));
  if (top1 + s1 < minTop) s1 = Math.ceil(minTop - top1); s2 = Math.max(s2, s1 - 4);
  return { H, W, s1, s2 };
}
const JUMP_TARGET = .72, JUMP_LIFT_MAX = 72, JUMP_FLOOR = .3;
function fitView() {
  const r = stageEl.getBoundingClientRect(); if (!r.width || !r.height || !st) return; const a = r.width / r.height, Hv0 = a <= 1.05 ? clamp(512 / a, 470, 900) : 520;
  let res = layoutFor(r, a, Hv0, 0); wallShift = res.s1; wallShift2 = res.s2;
  const M = charMetrics();
  if (M) {
    const reach = M.ymax + M.ext, L = clamp(Math.ceil(JUMP_TARGET * reach - (M.top - (lowestDrawn() + 6))), 0, JUMP_LIFT_MAX);
    if (L) { res = layoutFor(r, a, Hv0, L); wallShift = res.s1; wallShift2 = res.s2; }
    JUMPK = clamp((M.top - (lowestDrawn() + 6)) / reach, JUMP_FLOOR, 1);
    JUMPINFO = { lift: L, k: JUMPK, top: M.top, ymax: M.ymax, ext: M.ext, low: lowestDrawn() };
  }
  sc.setAttribute('viewBox', `${(512 - res.W) / 2} ${548 - res.H} ${res.W} ${res.H}`);
}
let JUMPINFO = null;
new ResizeObserver(fitView).observe(stageEl); addEventListener('resize', fitView);
const fsBtn = $('#fsBtn'), de = document.documentElement;
const fsReq = de.requestFullscreen || de.webkitRequestFullscreen, fsExit = document.exitFullscreen || document.webkitExitFullscreen, fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
/* Fullscreen API when the browser has it; otherwise a plain "focus" layout (same room, less chrome). Esc, resize and coming back from another tab keep the same character and the same animation. */
function setFs(on) { document.body.classList.toggle('fs', on); if (fsBtn) { const l = on ? 'exit full screen' : 'enter full screen'; fsBtn.setAttribute('aria-label', l); fsBtn.title = l; } setTimeout(fitView, 60); }
if (fsBtn) {
  fsBtn.onclick = async () => {
    if (fsEl()) { try { await fsExit.call(document); } catch {} return; }
    if (document.body.classList.contains('fs')) { setFs(false); return; }
    try { if (!fsReq) throw 0; await fsReq.call(de); } catch { setFs(true); }   /* refused or not supported: focus layout instead */
  };
  const onFs = () => setFs(!!fsEl());
  document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !fsEl() && document.body.classList.contains('fs') && !document.querySelector('dialog[open]')) setFs(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(fitView, 80); });
}
function burst(x, y, type, n = 5) { for (let i = 0; i < n; i++) parts.push(type === 'bit' ? { x: x + rnd(-8, 8), y, vx: rnd(-70, 70), vy: rnd(-170, -80), life: .9, type, s: rnd(.8, 1.3) } : { x: x + rnd(-14, 14), y: y + rnd(-6, 6), vx: rnd(-30, 30), vy: rnd(-70, -20), life: 1, type, s: rnd(.8, 1.2) }); }
function physics(dt) {
  OB.bowlDx *= Math.exp(-14 * dt);
  if (OB.crumb && (OB.crumbY < 0 || OB.crumbVy)) { OB.crumbVy += 2400 * dt; OB.crumbY += OB.crumbVy * dt; if (OB.crumbY >= 0) { OB.crumbY = 0; if (Math.abs(OB.crumbVy) > 220) OB.crumbVy *= -.3; else OB.crumbVy = 0; } }
  const co = OB.crumbOff; if (co) { co.t = (co.t || 0) + dt; if (co.t > 2.4) { co.dx *= Math.exp(-5 * dt); co.rot += (co.rot0 - co.rot) * Math.min(1, 5 * dt); if (Math.abs(co.dx) < .4) OB.crumbOff = null; } }   /* a refused crumb stays a moment, then slides back onto the plate */
  const P = OB.pebble;
  if (P.vis && (P.y < 0 || P.vy)) { P.vy += 2600 * dt; P.y += P.vy * dt; if (P.y >= 0) { P.y = 0; if (Math.abs(P.vy) > 260) { P.vy *= -.28; burst(P.x, GROUND, 'dust', 3); snd('stone'); } else P.vy = 0; } }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; if (p.type === 'bit') p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * (p.type === 'bit' ? 1.2 : 1.1); if (p.life <= 0) parts.splice(i, 1); }
}
function dropPebble(x) { const P = OB.pebble; P.vis = true; P.x = x; P.y = -420; P.vy = 0; P.rot = 0; }

/* ---------- coroutine helpers: the character is driven by whole runtime actions ---------- */
function* wait(sec) { let e = 0; while (e < sec) e += yield; }
function* awaitTap(sec) { S.tapWait = { x: null }; let e = 0; while (e < sec && S.tapWait.x === null) e += yield; const x = S.tapWait.x; S.tapWait = null; return x; }
function go(fn, interrupt) { pending = fn; pendingForce = !!interrupt; curIdle = false; }
let pendingForce = false;
const REST = { alert: 'idle', asleep: 'sleep' };
/* cancel a harmless, in-place action so a player's input is answered at once (the runtime has no cancel API yet) */
function forceRest() { if (g) g.cancel(); }   /* runtime 2.1: only curious, happy and pet are cancelable; cancel emits {type:'cancel'} and never a late end/bite/touch */
/* play one action and wait for its end; returns false if the runtime refuses it from the current state */
function* play(name, o = {}) {
  if (!g.can(name)) return false;
  const tok = { done: false }; S.hook = e => { if (e.type === 'end' && e.action === name) tok.done = true; if (o.on) o.on(e); };
  const { on, ...ro } = o; g.play(name, ro);
  let e = 0, lim = g.duration(name) + 2; while (!tok.done && e < lim) e += yield;
  S.hook = null; if (!tok.done) { g.state = ACTIONS[st.type][name].end; g.action = REST[g.state]; g.at = 0; g.opts = {}; g.loop = true; }
  return true;
}
/* walk by chaining hops with dx; the runtime owns the motion during each hop */
function* walkTo(x) {
  x = clamp(x, 100, 420);
  for (let i = 0; i < 6 && Math.abs(x - g.x) > 4; i++) { const dx = clamp(x - g.x, -90, 90); if (!(yield* play('hop', { dx }))) break; }
  if (Math.abs(x - g.x) <= 4) g.x = x;
}
const dirTo = x => (x >= g.x ? 1 : -1);
const feel = (key, stage) => say(line(st.type, key, stage));
const matY = () => GROUND - 5;

/* ---------- shared moments ---------- */
function mark(kind) { /* a shared moment that can count towards the bond; never more than one meeting per ~4 hours */
  if (S.did[kind]) return; S.did[kind] = true;
  const b = st.bond, fresh = b.meet === 0 || NOW() - b.lastMeet > 4 * HOUR;
  if (!S.counted && fresh) { S.counted = true; b.meet++; b.lastMeet = NOW(); if (b.meet === 1) { note('first'); unlockMemory('meeting'); } }
  else if (!S.counted) S.counted = true;
  if (kind === 'play' && b.lastPlayMeet !== b.meet) { b.lastPlayMeet = b.meet; b.play++; if (b.play === 2) note('known'); }
  S.checkUnlocks = true; recover({ feed: .3, pet: .4, play: .3, rest: .3, ritual: .4 }[kind] || .2); save();
}
const recognises = () => st.bond.play >= 2;
const sleepX = () => MATX + (st.prefs.rest ? 14 : -14) - (st.type === 'rolo' ? 30 : 0);

function* wakeSeq() {
  if (g.state !== 'asleep') return;
  S.asleep = false; yield* play('wake'); g.ground = GROUND; S.hide.mat = false;
}
function* sleepTask(auto) {
  if (g.state === 'asleep') { /* already asleep (entering the page) */ }
  else {
    yield* walkTo(sleepX());
    if (st.prefs.gest === 0) { yield* play('hop', { dx: 0 }); yield* play('hop', { dx: 0 }); }
    g.ground = matY(); S.matRot = 0; yield* play('tired');
  }
  S.asleep = true; S.sleepT = 0; note('nap'); st.dent = Math.min(1, st.dent + .05);
  let e = 0;
  while (S.asleep) { const dt = yield; e += dt; S.sleepT = e; st.needs.e = Math.min(1, st.needs.e + dt * .012); if (auto && e > auto) break; }
  if (S.asleep || g.state === 'asleep') { S.asleep = false; say(line(st.type, 'wake')); yield* play('wake'); }
  g.ground = GROUND;
}
function* greet() {
  const ls = line(st.type, 'greet', S.stage);
  yield* walkTo(MID + rnd(-30, 30));
  if (S.stage === 0) yield* play('curious', { dir: pick([-1, 1]) }); else yield* play('happy');
  say(ls); yield* wait(1.9 * ls.length);
}
function* greetAfterWake() { if (!S.greeted) { S.greeted = true; yield* greet(); yield* ritualGate(); } }
function* ritualGate() { if (S.tier >= 2 && S.rec < .6) return; if (S.stage >= 3 && recognises() && !S.ritualRan) { yield* wait(3); yield* ritual(true); } }

/* ---------- feeding ---------- */
function* eatSeq(c) {
  while (OB.crumbY < -1 || OB.crumbVy) yield;   /* let the served crumb land first */
  const anchor = BOWL_X + CRUMB_D[st.type] * SCL, fav = c.kind === st.prefs.food;
  yield* walkTo(anchor);
  S.hide.crumb = true;
  if (st.needs.h > .85) { /* full: the character looks, bumps the crumb gently aside and walks back; no bond change */
    let fin = null;
    const ok = yield* play('refuse', { dir: -1, on: e => { if (e.type === 'end' && e.props) fin = e.props.find(p => p.id === 'crumb'); } });
    trayNo('feed'); S.hide.crumb = false; if (fin) OB.crumbOff = { dx: (fin.x - (-CRUMB_D[st.type])) * SCL, rot: fin.rotation, rot0: CRUMB_ROT[st.type], t: 0 }; feel('full', S.stage); yield* wait(.8); return;
  }
  if (OB.crumbOff) OB.crumbOff.t = 99;   /* it slides home before the next meal */
  const ok = yield* play('eat', { dir: -1, on: e => { if (e.type === 'bite') { OB.bowlDx = e.t % 2 ? 2 : -2; recover(.12); snd('crumb'); } } });
  S.hide.crumb = false; if (!ok) return;
  OB.crumb = null; st.needs.h = Math.min(1, st.needs.h + (fav ? .45 : .34)); S.mood = Math.min(1, S.mood + (fav ? .12 : .05)); st.needs.m = Math.min(1, st.needs.m + (fav ? .1 : .04));
  if (fav) { st.bond.favSeen++; if (st.bond.favSeen === 2) note('fav'); }
  say(line(st.type, fav ? 'fav' : 'eat', S.stage)); mark('feed'); note('feed');
  if (fav || S.stage >= 2) yield* play('happy'); else yield* wait(1.2);
}
function feed(kind) {
  if (OB.crumb) { OB.bowlDx = 0; return; }
  CRUMB_KIND = kind;
  OB.crumb = { kind }; OB.crumbOff = null; OB.crumbY = -110; OB.crumbVy = 0; burst(BOWL_X, GROUND - 20, 'dust', 2);   /* a fresh crumb is served: it drops onto the plate */
  const run = function* () { if (S.asleep) yield* wakeSeq(); yield* eatSeq(OB.crumb); yield* idleLoop(); };
  go(run, true);
}

/* ---------- touch: a tap pets, a drag brushes dust off ---------- */
function* petTask(flinch) {
  if (S.asleep) { yield* wakeSeq(); yield* greetAfterWake(); return; }
  if (flinch) { yield* walkTo(clamp(g.x + (g.x > MID ? -70 : 70), X_MIN, X_MAX)); feel('flinch'); yield* play('curious', { dir: g.x > MID ? -1 : 1 }); return; }
  if (S.stage === 0 && !S.did.pet) { yield* play('curious', { dir: 1 }); }
  yield* play('pet');
  /* one finished gesture is a shared moment; more of the same adds nothing to care, mood or the bond */
  if (!S.petSaid) { S.petSaid = true; mark('pet'); note('pet'); feel('pet', S.stage); S.mood = Math.min(1, S.mood + .08); st.needs.m = Math.min(1, st.needs.m + .08); }
}
/* a drag brushes dust off continuously, but answers with ONE gesture until the player lets go */
function onBrush(px, py, dist, tap) {
  if (S.asleep || (S.tapWait && S.tapWait.x === null)) return;
  S.petTime += dist / 140; if (st.dust > 0 && !tap) { st.dust = Math.max(0, st.dust - dist * .0007); if (Math.random() < .5) burst(px, py, 'dust', 1); }
  const flinch = S.stage === 0 && S.petTime > 4.5 && !S.flinched && !S.petBusy;
  if (flinch) S.flinched = true; else if (S.petHold || S.petBusy) return;
  S.petHold = true;
  go(function* () { S.petBusy = true; yield* petTask(flinch); S.petBusy = false; yield* idleLoop(); }, true);
}
function poke() {
  if (S.asleep) { go(function* () { yield* wakeSeq(); yield* greetAfterWake(); yield* idleLoop(); }, true); return; }
  if (S.petBusy) return; S.petHold = false; onBrush(g.x, GROUND - 60, 30, true); S.petHold = false;
}

/* ---------- pebble: play, then the shared ritual once he knows the game ---------- */
/* choose where to stand and which way to push so the pebble starts where it is and ends on the shelf (pip pushes it far) */
function planPush(n) {
  const P = OB.pebble, ZMIN = 100, ZMAX = 312, sc = PD[n] * SCL, ec = (PD[n] + PUSH_END[n]) * SCL;
  const ok = (a, d) => { const e = a + d * ec; return a >= 130 && a <= 345 && e >= ZMIN && e <= ZMAX; };
  if (P.vis) {
    const opts = [1, -1].map(d => ({ d, a: P.x - d * sc })).filter(o => ok(o.a, o.d));
    if (opts.length) return opts.sort((p, q) => Math.abs(p.a - g.x) - Math.abs(q.a - g.x))[0];
  }
  const c = []; for (let a = 170; a <= 330; a += 10) for (const d of [-1, 1]) if (ok(a, d) && a + d * sc >= ZMIN && a + d * sc <= ZMAX) c.push({ d, a });
  c.sort((p, q) => Math.abs(p.a - MID) - Math.abs(q.a - MID)); return c[0] || { d: -1, a: 300 };
}
function* playBasic() {
  const P = OB.pebble, n = st.type, plan = planPush(n), d = plan.d, anchor = plan.a;
  const start = anchor + d * PD[n] * SCL; P.rot = 0;
  if (!P.vis) { dropPebble(start); yield* wait(.9); } else if (Math.abs(P.x - start) > 2) { burst(P.x, GROUND, 'dust', 2); P.x = start; }
  if (S.stage === 0) { yield* walkTo(anchor - d * 70); yield* play('curious', { dir: d }); yield* wait(.4); }
  yield* walkTo(anchor);
  S.hide.pebble = true; let fin = null;
  const ok = yield* play('push', { dir: d, on: e => { if (e.type === 'end' && e.props) fin = e.props.find(p => p.id === 'pebble'); } }); S.hide.pebble = false; if (!ok) return;
  P.x = fin ? g.x + fin.x * SCL : start + d * PUSH_END[n] * SCL; P.rot = fin ? fin.rotation : 0;   /* the pebble stays where the action left it */
  S.mood = Math.min(1, S.mood + .1); st.needs.e = Math.max(0, st.needs.e - .05); feel('play', S.stage); mark('play'); note('play');
  if (S.stage >= 1) yield* play('happy');
}
function play_() {
  S.act = 'play';
  go(function* () { if (S.asleep) yield* wakeSeq(); yield* (recognises() && S.stage >= 2 ? ritual(false) : playBasic()); yield* idleLoop(); }, true);
}

/* ---------- rest ---------- */
function restInvite() {
  if (S.asleep) return;
  S.act = 'rest';
  go(function* () {
    const tired = st.needs.e < .85 || S.stage >= 2;
    if (!tired) { yield* walkTo(MATX - 90); yield* play('curious', { dir: 1 }); feel('decline'); yield* wait(1.5); }
    else { mark('rest'); yield* sleepTask(26); yield* greetAfterWake(); }
    yield* idleLoop();
  }, true);
}

/* ---------- ritual: one clip per character, with an invitation beat before it ---------- */
function* ritual(initiated) {
  S.ritualRan = true; const n = st.type, R = RIT[n]; if (initiated) { st.bond.init++; note('init'); }
  const P = OB.pebble; let pebX = null;
  if (R.kind === 'pebble') { P.vis = true; P.rot = 0; P.y = 0; }
  const anchorFor = px => clamp(px - R.d * R.start * SCL, X_MIN, X_MAX);
  let anchor = R.kind === 'mat' ? R.at : R.at; if (R.kind === 'pebble') { pebX = anchor + R.d * R.start * SCL; P.x = pebX; }
  yield* walkTo(anchor);
  /* the beat: he looks at the player and waits to be joined; he carries on alone if nobody does */
  yield* play(S.stage >= 3 ? 'happy' : 'curious', { dir: R.kind === 'pebble' ? R.d : 1 });
  say(line(n, 'invite')); const tx = yield* awaitTap(6); const part = tx !== null;
  if (part && R.kind === 'pebble') { anchor = anchorFor(clamp(tx, 215, 330)); pebX = anchor + R.d * R.start * SCL; yield* walkTo(anchor); P.x = pebX; }
  if (R.kind === 'mat') { S.hide.mat = true; S.matRot = 0; } else S.hide.pebble = true;
  const ok = yield* play('ritual', { dir: R.d });
  S.hide.mat = false; S.hide.pebble = false; if (!ok) return;
  if (part) { burst(g.x, GROUND - 110, 'heart', 1); S.mood = Math.min(1, S.mood + .15); }
  if (st.bond.ritual === 0) { note('ritual'); }
  st.bond.ritual++; if (st.bond.ritual === 1) unlockMemory('ritual'); mark('ritual'); mark('play'); st.needs.e = Math.max(0, st.needs.e - .04); feel('done'); yield* wait(1.8);
}
function inviteRitual() { go(function* () { if (S.asleep) yield* wakeSeq(); yield* ritual(true); yield* idleLoop(); }, true); }

/* ---------- home: news, finds, notes ---------- */
/* grain notes: short cards from the world of grainpad. Wording about wallet safety goes through product and security review before release; `more` must point to an approved Grainpad page (placeholder: the docs). */
const NOTES = [
  { id: 'selfcustody', need: () => st.bond.meet >= 2, hint: 'after a couple of visits', more: '/docs',
    body: ['you hold the keys.', 'that means nobody else can restore them for you.', 'keep your recovery phrase offline. never share it.', 'boring. important.'] },
];
function* announceUnlocks() {
  const now = ownedIds(), fresh = now.filter(i => !st.home.announced.includes(i)); updateBadge();
  const nt = NOTES.find(n => n.need() && !st.notesRead.includes(n.id) && !st.flags['na_' + n.id]);
  if (nt) { st.flags['na_' + nt.id] = true; save(); say(['i have a note for you.', 'it is in the menu. no rush.']); yield* play('curious', { dir: g.x > 250 ? -1 : 1 }); yield* wait(1); }
  if (!fresh.length) return;
  st.home.announced = now; save(); updateBadge();
  const names = fresh.slice(0, 2).map(labelOf).join(' and ');
  say(['something new at home.', names + '.']); yield* play('curious', { dir: g.x > 250 ? -1 : 1 }); yield* play('happy'); yield* wait(1);
}
const dotNew = $('#homeDot');
function updateQuick() {
  const q = k => document.querySelector(`[data-q=${k}]`); if (!q('home') || !st) return; const seen = st.home.seen;
  const newDeco = ownedIds().some(i => !seen.includes(i) && !i.startsWith('mem:')), newMem = Object.keys(st.memories).some(k => !seen.includes('mem:' + k));
  const flags = { home: newDeco ? 'new thing' : newMem ? 'new memory' : '', notes: NOTES[0].need() && !st.notesRead.includes(NOTES[0].id) ? 'unread' : '', ideas: '', history: '', share: '' };
  if (st.finds.pending !== null) flags.home = 'new find';
  for (const [k, v] of Object.entries(flags)) { const b = q(k); if (!b) continue; let m = b.querySelector('.mk'); if (!m) { m = document.createElement('i'); m.className = 'mk'; b.append(m); } m.textContent = v; m.hidden = !v; }
}
function updateBadge() { updateQuick(); if (dotNew) dotNew.hidden = true; if (st) $('#homeBtn').classList.toggle('new', (ownedIds().some(i => !st.home.seen.includes(i)) || Object.keys(st.memories).some(k => !st.home.seen.includes('mem:' + k)))); }
/* a find: it brings one now and then, the player decides whether it lives on the shelf */
const findBox = $('#findPrompt');
function showFindPrompt() {
  const id = st.finds.pending; if (id === null || !findBox) return; findBox.replaceChildren();
  const t = document.createElement('span'); t.textContent = st.name + ' found ' + FINDS[id].n + '. show it at home?'; findBox.append(t);
  for (const [label, show] of [['show it', true], ['keep it safe', false]]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => settleFind(show); findBox.append(b); }
  findBox.hidden = false;
}
function settleFind(show) {
  const f = st.finds, id = f.pending; if (id === null) return;
  f.got.push(id); if (show && f.shown.length < 5) f.shown.push(id); f.pending = null; f.lastMeet = st.bond.meet; OB.find = null; findBox.hidden = true;
  note('find'); unlockMemory('find', id); S.checkUnlocks = true; save();
  go(function* () { yield* play('happy'); yield* idleLoop(); }, true);
}
function* maybeBringFind() {
  const f = st.finds; if (f.pending !== null || f.got.length >= 5 || S.stage < 1 || S.foundThis || st.bond.meet < 2) return;
  if (st.bond.meet - f.lastMeet < FIND_EVERY[st.type]) return;
  S.foundThis = true; const id = FIND_ORDER[st.type].find(i => !f.got.includes(i)); if (id === undefined) return;
  yield* walkTo(MID + 40); yield* play('curious', { dir: -1 });
  OB.find = { id, x: g.x - 120, y: 0 }; burst(g.x - 120, GROUND - 10, 'dust', 3); f.pending = id; save(); say('found this.'); showFindPrompt(); yield* play('happy');
}

/* ---------- absence: how the grain looks, reacts and recovers ---------- */
const SPOTS = () => { const a = [{ x: BOWL_X, y: GROUND - 14 }, { x: MATX, y: GROUND - 8 }, { x: SLOTS.win.x + 56, y: SLOTS.win.y + 60 + wallShift }, { x: OB.pebble.x, y: GROUND - 6 }]; for (const k of ['decoA', 'decoB']) if (String(st.home[k]).startsWith('xmr') && !SLOTS[k].hidden) a.push({ x: SLOTS[k].x + SLOTS[k].w / 2, y: SLOTS[k].y + SLOTS[k].h / 2 + (SLOTS[k].row === 2 ? wallShift2 : wallShift) }); return a; };
function lookAt(x, y, sec = 1.6) { if (S) S.look = { x, y, until: T + sec }; }
function recover(a) {
  if (!S || S.tier === 0) return; const was = S.rec; S.rec = Math.min(1, S.rec + a);
  if (was < .5 && S.rec >= .5 && S.tier >= 2) setTimeout(() => { if (S && !S.asleep) feel('better'); }, 700);
}
/* the resting overlay: slow posture (about 1.5 s), fast eyes (about 100 ms) */
function updateOverlay(dt) {
  if (!S || !g) return;
  const base = TIER_OV[S.tier], k = 1 - S.rec, ov = S.ov, reduce = REDUCED();
  const looking = S.look && S.look.until > T && !S.asleep;
  let ex = 0, ey = base.ey * k;
  if (looking) { ex = clamp((S.look.x - g.x) / 5, -22, 22); ey = clamp((S.look.y - (g.ground - 50)) / 7, -9, 12) + base.ey * k * .3; }
  const slow = 1 - Math.exp(-dt * (reduce ? 1 : 1.9)), fast = 1 - Math.exp(-dt * 16);
  ov.open += (1 - (1 - base.open) * k - ov.open) * slow; ov.sy += (1 - (1 - base.sy) * k - ov.sy) * slow; ov.r += (base.r * k - ov.r) * slow;
  ov.ex += (ex - ov.ex) * fast; ov.ey += (ey - ov.ey) * fast;
  OVERLAY = { ex: ov.ex, ey: ov.ey, r: ov.r, sy: ov.sy, sx: 1 + (1 - ov.sy) * .6, open: ov.open, mouth: S.tier === 3 && S.rec < .35 && !looking ? 'flat' : null };
}
/* player preferences (not part of the grain's save): sound and calm motion */
const PREFS_KEY = 'grainpet.prefs';
const PREFS = (() => { try { return { sound: true, calm: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { sound: true, calm: false }; } })();
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(PREFS)); } catch {} document.body.classList.toggle('calm', !!PREFS.calm); };
const REDUCED = () => PREFS.calm || matchMedia('(prefers-reduced-motion: reduce)').matches;
/* short soft sounds, one per material, synthesised (no files). Starts only after the first touch; one mute switch. */
let AC = null, NZ = null;
function audio() {
  if (AC || !PREFS.sound) return AC; try { AC = new (window.AudioContext || window.webkitAudioContext)(); const n = AC.sampleRate * .4, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; NZ = b; } catch { AC = null; } return AC;
}
const SND = {
  crumb: [['n', 1900, 3, .07, .5], ['n', 1200, 3, .05, .35, .045]], stone: [['t', 560, 300, .08, .5], ['n', 2400, 4, .02, .2]], cloth: [['n', 380, .8, .16, .55, 0, 'lp']],
  page: [['n', 3200, 1.2, .16, .35, 0, 'sweep']], glint: [['t', 1900, 1700, .09, .22], ['t', 2600, 2400, .07, .14, .05]], pop: [['t', 420, 640, .09, .4]],
};
function snd(kind) {
  if (!PREFS.sound || !(AC || audio())) return; if (AC.state === 'suspended') AC.resume();
  const t0 = AC.currentTime; const out = AC.createGain(); out.gain.value = .18; out.connect(AC.destination);
  for (const [type, f, f2, dur, vol, at = 0, mode] of SND[kind] || []) {
    const t = t0 + at, g = AC.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.001, t + dur); g.connect(out);
    if (type === 't') { const o = AC.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t + dur); o.connect(g); o.start(t); o.stop(t + dur + .02); }
    else { const src = AC.createBufferSource(); src.buffer = NZ; const fl = AC.createBiquadFilter(); fl.type = mode === 'lp' ? 'lowpass' : 'bandpass'; fl.frequency.setValueAtTime(f, t); if (mode === 'sweep') fl.frequency.exponentialRampToValueAtTime(1100, t + dur); fl.Q.value = f2; src.connect(fl); fl.connect(g); src.start(t, Math.random() * .1, dur + .02); }
  }
}
/* recognises the return before any text: first a look, a small reaction, and only on a long absence one line */
function* welcomeBack() {
  const T_ = S.tier; curIdle = true;
  yield* wait(T_ === 1 ? .6 : .9);
  lookAt(MID, GROUND + 160, 2.4);                 /* toward the front of the room, where you are */
  yield* wait(.5);
  if (T_ === 1) yield* play('curious', { dir: 1 });
  else if (T_ === 2) { yield* play('curious', { dir: -1 }); lookAt(BOWL_X, GROUND - 14, 2.2); }
  else { yield* play('curious', { dir: 1 }); lookAt(MID, GROUND + 160, 4); yield* wait(.5); say(line(st.type, 'miss', S.stage)); yield* wait(3.4); }
  S.greeted = true;
  /* then it waits to be met: no wandering until you feed it, pet it or play */
  const until = T + (T_ === 3 ? 20 : 14);
  while (T < until && S.rec < .1) yield* wait(.5);
}
function* quietStep() {
  const T_ = S.tier, r = Math.random();
  if (r < .62) { const sp = pick(SPOTS()); lookAt(sp.x, sp.y, rnd(1.6, 2.8)); yield* wait(rnd(2.4, 4)); }
  else yield* play('curious', { dir: pick([-1, 1]) });
}

/* ---------- idle: each character has things of its own ---------- */
function* idleStep() {
  const n = st.type, d = pick([-1, 1]), mood = S.mood;
  const small = () => walkTo(clamp(g.x + rnd(-60, 60), X_MIN, X_MAX));
  const P = OB.pebble;
  switch (n) {
    case 'mori': if (Math.random() < .5) { yield* play('curious', { dir: d }); yield* wait(rnd(.6, 1.4)); } else yield* small(); break;
    case 'nori': if (P.vis && Math.abs(P.x - 235) > 14) { yield* playBasic(); } else yield* play('curious', { dir: d }); break;
    case 'pip': if (Math.random() < .6) yield* play('hop', { dx: 0 }); else yield* small(); break;
    case 'rolo': if (Math.random() < .4 && mood > .3) yield* play('curious', { dir: d }); else yield* wait(rnd(2, 4)); break;
    case 'peb': if (P.vis && Math.random() < .6) yield* playBasic(); else yield* play('curious', { dir: d }); break;
  }
}
function* idleLoop() {
  curIdle = true; S.act = null;
  for (;;) {
    yield* wait(rnd(2.4, 5.5) * (1 + (S.tier ? S.tier * .35 * (1 - S.rec) : 0))); if (S.asleep) return;
    if (S.checkUnlocks) { S.checkUnlocks = false; yield* announceUnlocks(); }
    yield* maybeBringFind();
    const nd = st.needs;
    if (nd.h < .3 && !OB.crumb && NOW() - S.hungrySaid > 90000) { S.hungrySaid = NOW(); feel('hungry'); yield* walkTo(BOWL_X + 120); yield* play('curious', { dir: -1 }); continue; }
    if (nd.e < .25) { feel('sleepy'); yield* wait(1); yield* sleepTask(30); continue; }
    if (OB.crumb && nd.h < .85) { yield* eatSeq(OB.crumb); continue; }
    const quiet = S.tier ? [0, .35, .7, .95][S.tier] * (1 - S.rec) : 0;
    if (Math.random() < quiet) { curIdle = false; yield* quietStep(); curIdle = true; continue; }
    if (Math.random() < .25) { const sp = pick(SPOTS()); lookAt(sp.x, sp.y, rnd(1.4, 2.4)); }
    curIdle = false; yield* idleStep(); curIdle = true;
    if (Math.random() < .12) feel('idle');
  }
}

/* ---------- entering ---------- */
/* how long you were gone shapes how the room greets you: 0 <8h content, 1 8-24h noticed, 2 24-48h hungrier and tired, 3 >48h missed you */
const tierOf = h => h < 8 ? 0 : h < 24 ? 1 : h < 48 ? 2 : 3;
const TIER_NAME = ['content', 'noticed you', 'hungry and tired', 'missed you'];
/* resting overlay per tier: eye openness, slump (sy), lean, gaze y. Recovery (S.rec 0..1) walks it back to normal. */
const TIER_OV = [{ open: 1, sy: 1, r: 0, ey: 0, x: 0 }, { open: .94, sy: .995, r: 0, ey: 2, x: 0 }, { open: .74, sy: .955, r: -2, ey: 5, x: 0 }, { open: .6, sy: .925, r: -3.5, ey: 8, x: 0 }];
function newSession() {
  const away = Math.max(0, Math.min(24 * 30, (NOW() - st.seen) / HOUR));
  S = { fx: {}, tier: tierOf(away), rec: 0, ov: { ...TIER_OV[tierOf(away)], ex: 0 }, look: null, stage: stageOf(), away, did: {}, counted: false, petTime: 0, mood: st.needs.m, asleep: false, greeted: false, hungrySaid: 0, sleepT: 0, tapWait: null, hide: {}, matRot: 0, hook: null, petBusy: false, checkUnlocks: true };
  st.sessions++; return away;
}
function applyAway(h) {
  const n = st.needs, fl = .25;
  n.h = fl + (n.h - fl) * Math.exp(-h / 30); n.m = .55 + (n.m - .55) * Math.exp(-h / 40); n.e = Math.min(1, n.e + h * .25);
  if (h >= 24) n.h = Math.min(n.h, h >= 48 ? .22 : .3);   /* clearly hungry, never starving: there is a floor and nothing is lost */
  st.dust = Math.min(.85, st.dust + h / 60);
  if (h > 20 && OB.pebble.vis) OB.pebble.x = clamp(OB.pebble.x + rnd(-30, 30), 215, 300);
}
function makeGrain(x, ground, state) {
  if (g) g.destroy();   /* never two live copies */
  g = GrainRuntime.create(gChar, { characterId: st.type, displayName: st.name, x, ground, scale: SCL, state: state || 'alert' });
  g.on(e => { if (S && S.hook) S.hook(e); });
}
function enter() {
  priceProvider.refresh(false); cur = null; pending = null; const away = newSession(); const first = st.sessions === 1 && st.bond.meet === 0 && !st.flags.arrived;
  parts.length = 0; OB.crumb = null; OB.pebble.vis = st.bond.play > 0; OB.pebble.x = 235; OB.pebble.y = 0; OB.pebble.rot = 0;
  if (first) st.flags.arrived = true;   /* the first meeting happens at home: no entrance */
  applyAway(away);
  if (S.tier >= 1) {   /* a real absence: awake, at home, recognises you first */
    if (away >= 30) note('away', away);
    makeGrain(MID, GROUND);
    go(function* () { yield* welcomeBack(); yield* ritualGate(); yield* idleLoop(); });
  } else if (away >= 1) {
    if (away >= 30) note('away', away);
    makeGrain(sleepX(), matY(), 'asleep'); S.asleep = true;
    go(function* () {
      yield* sleepTask(rnd(5, 8));
      if (away >= 30) { say(line(st.type, 'away')); yield* wait(2.2); }
      S.greeted = true; yield* greet(); yield* ritualGate(); yield* idleLoop();
    });
  } else {
    makeGrain(MID, GROUND);
    go(function* () { S.greeted = true; yield* greet(); yield* ritualGate(); yield* idleLoop(); });
  }
  if (st.finds.pending !== null) { OB.find = { id: st.finds.pending, x: 150, y: 0 }; showFindPrompt(); } else if (findBox) findBox.hidden = true;
  save();
}

/* ---------- per-frame ---------- */
let last = 0, saveT = 0, fitT = 0;
function tick(dt) {
  T += dt; saveT += dt; if (!st || !S) return;
  const n = st.needs; n.h = Math.max(.2, n.h - dt * .00003); n.m += (.55 - n.m) * dt * .0004; if (!S.asleep) n.e = Math.max(0, n.e - dt * .00002);
  if (sayT > 0) { sayT -= dt; if (sayT <= 0) nextSay(); }
  SHADOW = surfaceShadow(); updateOverlay(dt); updateTray(dt); GrainRuntime.tick(dt); physics(dt);
  /* a new request replaces the current task: at once while he is only waiting or doing a harmless in-place action, otherwise after the clip ends */
  if (pending && (!cur || curIdle || pendingForce)) {
    const safe = !cur || ['idle', 'sleep'].includes(g.action) || g.cancelable(g.action);
    if (safe) { forceRest(); cur = pending(); pending = null; curFirst = true; curIdle = false; S.hook = null; S.petBusy = false; }
  }
  if (cur) { const r = curFirst ? cur.next() : cur.next(dt); curFirst = false; if (r.done) { cur = null; curIdle = false; } }
  if (!cur && !pending) go(idleLoop);
  fitT += dt; if (fitT > 1) { fitT = 0; fitView(); }
  if (saveT > 5) { saveT = 0; save(); }
}
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, Math.max(0, (ts - last) / 1000)); last = ts;
  if (!st || !S) return; tick(dt); render();
}

/* ---------- input ---------- */
function svgPt(e) { const p = sc.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = sc.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
const onGrain = p => { const w = 140 * SCL * 1.1, h = 130 * SCL * 1.3; return ((p.x - g.x) / w) ** 2 + ((p.y - (g.ground - h * .7)) / h) ** 2 < 1; };
let down = null;
sc.addEventListener('pointerdown', e => {
  const p = svgPt(e); lookAt(p.x, p.y, 1.6); down = { t0: performance.now(), moved: 0, onG: onGrain(p), lx: p.x, ly: p.y };
  try { sc.setPointerCapture(e.pointerId); } catch {}
});
sc.addEventListener('pointermove', e => {
  if (S && !down) { const q = svgPt(e); lookAt(q.x, q.y, 1.2); }
  if (!down) return; const p = svgPt(e), d = Math.hypot(p.x - down.lx, p.y - down.ly); down.moved += d; down.lx = p.x; down.ly = p.y;
  if (down.onG && onGrain(p) && down.moved > 6) onBrush(p.x, p.y, d);
});
sc.addEventListener('pointerup', e => {
  if (!down) return; const p = svgPt(e), quick = performance.now() - down.t0 < 400 && down.moved < 10;
  S.petHold = false;
  if (quick) { if (S.tapWait && S.tapWait.x === null) S.tapWait.x = p.x; else if (down.onG) poke(); else shelfTap(p.x, p.y); }   /* during the invitation beat any tap joins in */
  down = null;
});
sc.addEventListener('pointercancel', () => { down = null; if (S) S.petHold = false; });
sc.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); poke(); } });
function shelfTap(x, y) {
  if (S.tapWait && S.tapWait.x === null) { S.tapWait.x = x; return; }
  if (slotTap(x, y)) return;
  if (x > MATX - 70 && y > GROUND - 50 && y < GROUND + 10 && !EDIT) restInvite();
}

/* ---------- the interaction tray: three small objects standing on a drawer ---------- */
/* every object has volume (lit top, dark underside) and a hard contact shadow like the character; art is drawn here, motion and states live in CSS */
const TSH = '<ellipse class="sh" cx="60" cy="76" rx="38" ry="7" fill="#8c7359" fill-opacity=".5" style="mix-blend-mode:multiply"/>';
const TSLOT = '<g class="slot"><ellipse cx="60" cy="75" rx="40" ry="8.5" fill="#cdb48e"/><ellipse cx="60" cy="73.6" rx="36" ry="6.4" fill="#bfa479"/></g>';
const TCRUMB = '<path d="M-14 6 L-9 -7 Q-8 -11 -3 -11 L8 -10 Q13 -9 14 -4 L13 4 Q12 8 7 9 L-8 10 Q-13 10 -14 6Z" fill="#c98d3f"/><path d="M-14 1 L-9 -12 Q-8 -16 -3 -16 L8 -15 Q13 -14 14 -9 L13 -1 Q12 3 7 4 L-8 5 Q-13 5 -14 1Z" fill="#f2c27a"/><path d="M-9 -10 Q-3 -13 5 -12" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round"/><circle cx="3" cy="-5" r="1.8" fill="#c98d3f"/>';
const TPEB = '<path d="M-26 6 Q-28 -14 -8 -20 Q14 -26 26 -10 Q32 0 26 10 Q16 17 -6 16 Q-24 15 -26 6Z" fill="#8f7f6b"/><path d="M-26 0 Q-28 -19 -8 -25 Q14 -31 26 -15 Q32 -6 26 4 Q16 10 -6 9 Q-24 8 -26 0Z" fill="#c7b8a2"/><path d="M-17 -15 Q-6 -22 8 -22" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/><circle cx="8" cy="-6" r="2.4" fill="#a39380"/><circle cx="-8" cy="0" r="1.9" fill="#a39380"/><circle cx="14" cy="2" r="1.5" fill="#a39380"/>';
/* an occupied bed shows the real silhouette of the grain that sleeps in it (its own sleep frame), small, on the pillow */
const SLEEP_K = { mori: .135, nori: .13, pip: .115, rolo: .105, peb: .13 };
const BEDSLEEP = ty => { let c = ''; try { c = renderAction(ty, 'sleep', 1).character; } catch {} return `<g class="sleeper"><g transform="translate(36 53) scale(${SLEEP_K[ty] || .1})">${c}</g></g>`; };
const trayArt = {
  plate: () => { const v = optOf('bowl', st.home.bowl); return `${TSLOT}${TSH.replace('rx="38"', 'rx="44"')}<g class="obj"><ellipse cx="60" cy="71" rx="42" ry="10" fill="${v.c}"/><ellipse cx="60" cy="67" rx="42" ry="10" fill="${v.a}"/><ellipse cx="60" cy="68" rx="30" ry="6.4" fill="${v.b}"/><path d="M26 63 Q38 57 54 57" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round"/><g class="crumb"><g transform="translate(60 60)">${TCRUMB}</g></g></g>`; },
  pebble: () => `${TSLOT}${TSH}<g class="obj"><g class="turn"><g transform="translate(60 61) scale(1.02)">${TPEB}</g></g></g><path class="glint" d="M84 34 l2.2 5.2 5.2 2.2 -5.2 2.2 -2.2 5.2 -2.2 -5.2 -5.2 -2.2 5.2 -2.2z" fill="#fff"/>`,
  bed: (ty = st.type) => `<g transform="translate(60 78) scale(.87) translate(-60 -78)">${TSLOT}${TSH.replace('rx="38"', 'rx="48"')}<g class="obj"><g class="bedbase"><rect x="12" y="66" width="96" height="8" rx="3" fill="#7a5c38"/><rect x="16" y="73" width="9" height="5" rx="2" fill="#5f4529"/><rect x="95" y="73" width="9" height="5" rx="2" fill="#5f4529"/><rect x="8" y="28" width="10" height="46" rx="4" fill="#8f6f45"/><rect x="8" y="28" width="10" height="7" rx="3.5" fill="#c9a876"/><rect x="14" y="52" width="96" height="14" rx="4" fill="#cdb78f"/><rect x="14" y="45" width="96" height="14" rx="5" fill="#f6ead5"/></g><g class="pil"><rect x="22" y="38" width="32" height="14" rx="7" fill="#dccbab"/><rect x="22" y="34" width="32" height="14" rx="7" fill="#fff6e6"/><path d="M28 38 Q36 35 46 36" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/></g>${BEDSLEEP(ty)}<g class="blk"><rect x="46" y="42" width="64" height="20" rx="6" fill="#d94e00"/><rect x="46" y="36" width="64" height="21" rx="6" fill="#ff7a29"/><rect x="46" y="36" width="64" height="9" rx="4.5" fill="#ffb27a"/><path d="M50 45 H106" stroke="#d94e00" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round"/><path d="M86 47 a6.5 6.5 0 1 0 4.4 11.6 a5 5 0 1 1 -4.4 -11.6z" fill="#fff0dc"/></g><g class="zz"><path d="M88 22 h9 l-9 9 h9" fill="none" stroke="#5d5246" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M100 10 h6 l-6 6 h6" fill="none" stroke="#5d5246" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g></g></g>`,
  crumb0: () => `${TSH}<g class="obj"><g class="turn"><g transform="translate(60 62) scale(1.8) rotate(6)">${TCRUMB}</g></g></g>`,
  crumb1: () => `${TSH}<g class="obj"><g class="turn"><g transform="translate(60 58) scale(1.0)">${popcorn(0, 0, 25, -4)}</g></g></g>`,
  crumb2: () => `${TSH}<g class="obj"><g class="turn"><g transform="translate(60 62)"><path d="M-30 6 Q-34 -6 -22 -10 Q0 -16 22 -10 Q34 -6 30 6 Q28 14 0 14 Q-28 14 -30 6Z" fill="#b48d58"/><path d="M-30 1 Q-34 -11 -22 -15 Q0 -21 22 -15 Q34 -11 30 1 Q28 8 0 8 Q-28 8 -30 1Z" fill="#d9b078"/><path d="M-20 -10 Q-4 -15 14 -12" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/><path d="M-6 -2 q4 3 9 0" fill="none" stroke="#b48d58" stroke-width="2" stroke-linecap="round"/></g></g></g>`,
  back: () => `<g class="obj"><g transform="translate(60 56)"><circle r="23" fill="#d3bf9c" cy="4"/><circle r="23" fill="#f6ead5"/><path d="M8 -9 L-8 0 L8 9 M-8 0 H14" fill="none" stroke="#5d5246" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></g></g>`,
};
function buildTray() {
  document.querySelectorAll('.tb').forEach(b => { const k = b.dataset.obj, f = trayArt[k]; if (f) b.querySelector('.art').innerHTML = `<svg viewBox="0 0 120 88" aria-hidden="true" focusable="false">${f()}</svg>`; });
}
const traySt = {};   /* last data-st per button, so the DOM is touched only on change */
let trayT = 0;
function setTray(a, v) { const b = document.querySelector(`#actions [data-a="${a}"]`); if (!b || traySt[a] === v) return; traySt[a] = v; b.dataset.st = v; const hint = { hint: { feed: 'hungry', play: 'new', rest: 'sleepy' }[a] }; }
const coolUntil = {};
function trayNo(a) { const b = document.querySelector(`#actions [data-a="${a}"]`); if (!b) return; b.classList.remove('no'); void b.offsetWidth; b.classList.add('no'); coolUntil[a] = T + 3; }
function updateTray(dt) {
  trayT += dt; if (trayT < .2 || !S) return; trayT = 0;
  const n = st.needs, act = S.act;
  const busy = { feed: !!OB.crumb || act === 'feed', play: act === 'play', rest: S.asleep || act === 'rest' };
  for (const a in busy) if (S.pb && S.pb[a] && !busy[a]) coolUntil[a] = T + 2.2;   /* the object comes back with a small pop */
  S.pb = busy;
  const st_ = (a, hint, soft) => setTray(a, busy[a] ? 'busy' : T < (coolUntil[a] || 0) ? 'cool' : soft ? 'soft' : hint ? 'hint' : 'idle');
  st_('feed', n.h < .45, n.h > .85);
  st_('play', st.finds.pending !== null || !!OB.find, false);
  st_('rest', n.e < .4 && !S.asleep, false);
}
/* instant press feedback (on pointerdown, before the click) and a small overshoot on release */
document.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('.tb'); if (b) { b.classList.remove('rel'); b.classList.add('press'); snd({ plate: 'crumb', pebble: 'stone', bed: 'cloth' }[b.dataset.obj] || (b.dataset.f !== undefined ? 'crumb' : 'pop')); if (navigator.vibrate && !REDUCED()) try { navigator.vibrate(8); } catch {} } });
const unpress = e => document.querySelectorAll('.tb.press').forEach(b => { b.classList.remove('press'); void b.offsetWidth; b.classList.add('rel'); setTimeout(() => b.classList.remove('rel'), 320); });
document.addEventListener('pointerup', unpress); document.addEventListener('pointercancel', unpress);

/* ---------- buttons ---------- */
document.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => { const q = b.dataset.q; if (q === 'home') (sheetEl.hidden ? openEdit() : closeSheet()); if (q === 'notes') openNotes(); if (q === 'ideas') openIdeas(); if (q === 'history') openHistory(); if (q === 'share') openShare('meet'); }; });
const actions = $('#actions'), tray = $('#tray');
actions.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !S) return; const a = b.dataset.a;
  if (a === 'feed') { actions.hidden = true; tray.hidden = false; lookAt(BOWL_X, GROUND - 14, 2.4); }
  if (a === 'play') { lookAt(OB.pebble.x, GROUND - 6, 2); play_(); }
  if (a === 'rest') { lookAt(MATX, GROUND - 8, 2); restInvite(); }
});
tray.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.a === 'trayClose') { tray.hidden = true; actions.hidden = false; return; }
  feed(+b.dataset.f); tray.hidden = true; actions.hidden = false;
});

/* ---------- dialogs: name, notes, backup, share ---------- */
const nameTxt = $('#nameTxt'); const setName = () => { nameTxt.textContent = st.name; };
function openRename() { const d = $('#dName'); $('#inName').value = st.name; d.showModal(); $('#inName').select(); }
$('#nameBtn').onclick = openRename;
$('#nmHist').onclick = () => { $('#dName').close(); openHistory(); }; $('#nmShare').onclick = () => { $('#dName').close(); openShare('meet'); };
$('#okName').onclick = () => { const v = $('#inName').value.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16); if (v) { st.name = v; setName(); save(); } $('#dName').close(); };
$('#fName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#okName').click(); } });
const menuLabels = () => { $('#mSound').textContent = 'sound: ' + (PREFS.sound ? 'on' : 'off'); $('#mCalm').textContent = 'calm motion: ' + (PREFS.calm ? 'on' : 'off'); $('#mReset').textContent = 'start over'; $('#mReset').dataset.sure = ''; };
$('#menuBtn').onclick = () => { menuLabels(); $('#dMenu').showModal(); };
$('#dMenu').addEventListener('click', e => {
  const m = e.target.dataset && e.target.dataset.m; if (!m) return;
  if (m === 'sound') { PREFS.sound = !PREFS.sound; savePrefs(); if (PREFS.sound) snd('pop'); menuLabels(); return; }
  if (m === 'calm') { PREFS.calm = !PREFS.calm; savePrefs(); menuLabels(); return; }
  if (m === 'reset') { const b = e.target; if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'tap again: this clears this grain'; return; } noSave = true; try { localStorage.removeItem(LS); } catch {} location.reload(); return; }
  $('#dMenu').close();
  if (m === 'backup') { $('#code').value = exportCode(); $('#bkMsg').textContent = ''; $('#dBackup').showModal(); }
  if (m === 'about') { $('#infoT').replaceChildren('grainpet', Object.assign(document.createElement('i'), { textContent: '.' })); $('#infoB').textContent = 'a little world by grainpad. your grain lives in this browser only: nothing is sent anywhere. no coins, no streaks, no pressure.'; $('#dInfo').showModal(); }
});
function exportCode() { save(); return 'GRAIN1.' + btoa(unescape(encodeURIComponent(JSON.stringify(st)))); }
function importCode(t) {
  try { t = String(t).trim(); if (t.startsWith('GRAIN1.')) t = decodeURIComponent(escape(atob(t.slice(7)))); const o = sanitize(JSON.parse(t)); if (!o) throw 0; return o; } catch { return null; }
}
function restore(text) {
  const o = importCode(text), m = $('#bkMsg');
  if (!o) { m.textContent = 'that code did not work. nothing changed.'; return; }
  if (!confirm('replace this grain with the one in the code?')) return;
  st = o; save(); location.reload();
}
$('#cpCode').onclick = async () => { try { await navigator.clipboard.writeText($('#code').value); $('#bkMsg').textContent = 'copied.'; } catch { $('#code').select(); $('#bkMsg').textContent = 'select and copy by hand.'; } };
$('#dlCode').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('#code').value], { type: 'text/plain' })); a.download = `${st.name}-grain.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
$('#upCode').onclick = () => restore($('#code').value);
$('#fileCode').onchange = e => { const f = e.target.files[0]; if (!f || f.size > 100000) return; f.text().then(restore); };

/* ---------- customise: a bottom sheet under the live room. Touch a place in the room, or pick from the sheet ---------- */
const TABS = [['frames', 'frames'], ['art', 'wall art'], ['layout', 'layout'], ['wall', 'wall'], ['cloth', 'cloth'], ['bowl', 'plate'], ['shelfObj', 'shelf'], ['finds', 'finds'], ['plate', 'nameplate']];
const tabForSlot = k => (k === 'cloth' || k === 'bowl' ? k : k === 'win' || k === 'notebook' ? 'layout' : k.startsWith('deco') ? 'art' : ['hero', 's1', 's2'].includes(k) ? 'frames' : k === 'finds' ? 'finds' : k === 'nameplate' ? 'plate' : k === 'shelf' ? 'shelfObj' : 'frames');
const sheetEl = $('#sheet'), tabsEl = $('#sheetTabs'), gridEl = $('#sheetGrid'); let sheetTab = 'frames';
function thumb(cat, key) {
  const v = (inner, vb = '0 0 72 72') => `<svg viewBox="${vb}" width="64" height="64" aria-hidden="true">${inner}</svg>`;
  if (cat === 'wall') { const o = CAT.wall.opts[key]; return v(`<rect x="2" y="2" width="68" height="68" rx="12" fill="${o.c}"/><circle cx="22" cy="22" r="26" fill="${o.glow}" opacity=".8"/><rect x="2" y="52" width="68" height="18" fill="#b89a70"/><rect x="2" y="48" width="68" height="6" fill="#d6bc92"/>`); }
  if (cat === 'cloth') return v(`<g transform="translate(36 38) scale(.5)">${matSvg(100, 0, CAT.cloth.opts[key])}</g>`);
  if (cat === 'bowl') return v(`<g transform="translate(36 42) scale(.8)">${plateSvg(CAT.bowl.opts[key])}</g>`);
  if (cat === 'shelfObj') { if (key === 'none') return v('<rect x="14" y="52" width="44" height="6" rx="3" fill="#b89a70"/>'); return v(`<g transform="translate(36 64) scale(.72)">${shelfObjSvg2(key)}</g>`); }
  if (cat === 'plate') { const o = CAT.plate.opts[key]; return key === 'off' ? v('<path d="M16 16 L56 56 M56 16 L16 56" stroke="#9d8260" stroke-width="5" stroke-linecap="round"/>') : v(`<rect x="7" y="27" width="58" height="22" rx="8" fill="#b89a70"/><rect x="7" y="25" width="58" height="22" rx="8" fill="${o.bg}"/><text x="36" y="42" text-anchor="middle" font-family="Albert Sans, sans-serif" font-weight="800" font-size="14" style="fill:${o.fg}">${ESC(st.name.slice(0, 7))}</text>`); }
  if (cat === 'deco') { if (!key) return v('<path d="M16 16 L56 56 M56 16 L16 56" stroke="#9d8260" stroke-width="5" stroke-linecap="round"/>'); const [nw, nh] = DECO_SIZE[key], k = Math.min(64 / nw, 62 / nh); return v(`<g transform="translate(${(72 - nw * k) / 2} ${(72 - nh * k) / 2}) scale(${k})">${decoInner(key, 12, 10)}</g>`); }
  if (cat === 'mem') { if (!key) return v('<path d="M16 16 L56 56 M56 16 L16 56" stroke="#9d8260" stroke-width="5" stroke-linecap="round"/>'); return v(`<rect x="6" y="6" width="60" height="60" rx="11" fill="#1a1714"/><rect x="13" y="13" width="46" height="46" rx="5" fill="#f6ead7"/>${vignette(key, 36, 36, .75)}`); }
  if (cat === 'layout') { const L = LAYOUTS[LAYOUT_BP][key], x0 = LAYOUT_BP === 'n' ? 12 : -66, sc = LAYOUT_BP === 'n' ? 56 / 500 : 56 / 656, col = { win: '#fff', hero: '#1a1714', s1: '#1a1714', s2: '#1a1714', notebook: '#ff6600', decoA: '#c9b08c', decoB: '#c9b08c', finds: '#b89a70' };
    let g = ''; for (const k of Object.keys(SLOT_META)) { const [x, y, w, h] = L[k]; const fh = k === 'finds' ? 8 : h, fy = k === 'finds' ? y + 36 : y; g += `<rect x="${((x - x0) * sc + 8).toFixed(1)}" y="${((fy - 56) * sc + 8).toFixed(1)}" width="${(w * sc).toFixed(1)}" height="${Math.max(2.5, fh * sc).toFixed(1)}" rx="${k === 's1' ? 6 : 2.5}" fill="${col[k]}"/>`; }
    return v(`<rect x="2" y="2" width="68" height="68" rx="12" fill="#e9dac6"/>${g}<rect x="2" y="56" width="68" height="14" fill="#b89a70"/>`); }
  if (cat === 'find') return v(`<circle cx="36" cy="36" r="32" fill="#f6ead7"/>${findAt(key, 36, 48, 2)}`);
  return '';
}
const shelfObjSvg2 = k => k === 'plant' ? plantSvg(day()) : k === 'lamp' ? lampSvg(false) : k === 'books' ? booksSvg() : personalSvg(st.type);
function renderSheet() {
  const keepT = tabsEl.scrollLeft; tabsEl.replaceChildren(); gridEl.replaceChildren();
  for (const [id, label] of TABS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = 'tab' + (id === sheetTab ? ' on' : ''); b.dataset.tab = id; tabsEl.append(b); }
  const cell = (cat, key, label, on, lock, hint, data) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'cell' + (on ? ' on' : '') + (lock ? ' lock' : ''); b.innerHTML = `<span class="th">${thumb(cat, key)}${lock ? '<i class="lk"></i>' : ''}</span><span class="lb">${ESC(label)}</span>${lock ? `<span class="ht">${ESC(hint || '')}</span>` : ''}`; Object.assign(b.dataset, data); b.disabled = !!lock; gridEl.append(b); };
  const hm = st.home;
  sheetEl.classList.toggle('pick', !EDIT.cat); gridEl.hidden = !EDIT.cat;
  if (!EDIT.cat) { $('#sheetHint').textContent = 'tap something in the room, or pick a group.'; tabsEl.querySelectorAll('.tab.on').forEach(t => t.classList.remove('on')); return; }
  if (sheetTab === 'layout') {
    $('#sheetHint').textContent = 'three ways to arrange the wall.';
    LAYOUTS[LAYOUT_BP].forEach((l, i) => cell('layout', i, l.name, hm.comp === i, false, '', { layout: i }));
  } else if (sheetTab === 'frames') {
    if (!['hero', 's1', 's2'].includes(EDIT.sel)) EDIT.sel = 'hero';
    $('#sheetHint').textContent = 'tap a frame on the wall, then pick a moment.';
    cell('mem', '', 'empty', !hm.frames[EDIT.sel], false, '', { frame: '' });
    for (const [k, m] of Object.entries(MEM)) { const have = !!st.memories[k]; cell('mem', k, m.name, hm.frames[EDIT.sel] === k, !have, 'opens with ' + m.hint, { frame: k }); }
  } else if (sheetTab === 'art') {
    if (!EDIT.sel.startsWith('deco')) EDIT.sel = 'decoA';
    $('#sheetHint').textContent = 'tap a spot on the wall, then pick what hangs there.';
    cell('deco', '', 'nothing', !hm[EDIT.sel], false, '', { deco: '' });
    for (const [k, o] of Object.entries(CAT.deco.opts)) if (!(o.hidden && o.hidden())) cell('deco', k, o.name, (k === 'xmrf' ? hm.decoA : hm[EDIT.sel]) === k, !o.need(), o.hint, { deco: k });
  } else if (sheetTab === 'finds') {
    $('#sheetHint').textContent = st.finds.got.length ? 'choose which finds sit on the shelf.' : st.name + ' brings something small now and then.';
    for (let i = 0; i < 5; i++) { const got = st.finds.got.includes(i); cell('find', i, got ? FINDS[i].n.replace(/^an? /, '') : '?', st.finds.shown.includes(i), !got, 'not found yet', { find: i }); }
  } else {
    const cat = sheetTab; $('#sheetHint').textContent = { wall: 'the wall behind everything.', cloth: 'where it rests.', bowl: 'where the crumbs go.', shelfObj: 'one small thing on the shelf.', plate: 'its name, on the shelf front.' }[cat];
    for (const [k, o] of Object.entries(CAT[cat].opts)) cell(cat, k, optName(cat, k), hm[cat] === k, !o.need(), o.hint, { cat, key: k });
  }
  const on = gridEl.querySelector('.cell.on'), tOn = tabsEl.querySelector('.tab.on'); if (tOn) tOn.scrollIntoView({ inline: 'center', block: 'nearest' }); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function openEdit() {   /* 'make it yours': the room shows what can change; nothing is chosen yet */
  document.body.classList.add('editing'); EDIT = { sel: null, cat: null }; sayQ.length = 0; sayEl.classList.add('off'); $('#actions').hidden = true; $('#tray').hidden = true; sheetEl.hidden = false; renderSheet(); st.home.seen = ownedIds(); save(); updateBadge();
}
function openSheet(tab, sel) {
  document.body.classList.add('editing'); sayQ.length = 0; sayEl.classList.add('off'); sheetTab = tab || sheetTab; EDIT = { cat: sheetTab, sel: sel || (sheetTab === 'art' ? 'decoA' : sheetTab === 'frames' ? 'hero' : sheetTab) };
  $('#actions').hidden = true; $('#tray').hidden = true; sheetEl.hidden = false; renderSheet();
  st.home.seen = ownedIds(); save(); updateBadge();
}
function closeSheet() { document.body.classList.remove('editing'); EDIT = null; sheetEl.hidden = true; $('#actions').hidden = false; save(); updateBadge(); }
$('#sheetClose').onclick = closeSheet;
$('#homeBtn').onclick = () => (sheetEl.hidden ? openEdit() : closeSheet());
tabsEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; sheetTab = b.dataset.tab; if (EDIT) { EDIT.cat = sheetTab; if (sheetTab === 'art') EDIT.sel = 'decoA'; else if (sheetTab === 'frames') EDIT.sel = 'hero'; else EDIT.sel = sheetTab; } renderSheet(); });
gridEl.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return; const d = b.dataset, hm = st.home;
  if (d.cat) hm[d.cat] = d.key;
  else if (d.layout !== undefined) { hm.comp = +d.layout; applyLayout(LAYOUT_BP, hm.comp); }
  else if (d.deco === 'xmrf') { const prev = hm.decoA; hm.decoA = 'xmrf'; if (EDIT.sel === 'decoB' && hm.decoB === 'xmr') hm.decoB = null; if (prev && prev !== 'xmrf' && !hm.decoB) hm.decoB = prev; EDIT.sel = 'decoA'; }   /* the large chart always hangs in the first wall-art place */
  else if (d.deco !== undefined) { hm[EDIT.sel] = d.deco || null; if (d.deco && hm[EDIT.sel === 'decoA' ? 'decoB' : 'decoA'] === d.deco) hm[EDIT.sel === 'decoA' ? 'decoB' : 'decoA'] = null; }
  else if (d.frame !== undefined) { for (const k of ['hero', 's1', 's2']) if (d.frame && hm.frames[k] === d.frame) hm.frames[k] = null; hm.frames[EDIT.sel] = d.frame || null; }
  else if (d.find !== undefined) { const id = +d.find, i = st.finds.shown.indexOf(id); if (i >= 0) st.finds.shown.splice(i, 1); else if (st.finds.shown.length < 5) st.finds.shown.push(id); }
  fitView();
  { const lab = d.cat ? optName(d.cat, d.key) + ' ' + CAT[d.cat].label : d.deco ? CAT.deco.opts[d.deco].name : d.frame ? MEM[d.frame].name + ' frame' : ''; if (lab) hm.lastPlaced = { label: lab, slot: d.cat ? (d.cat === 'shelfObj' ? 'shelf' : null) : (d.deco !== undefined || d.frame !== undefined ? EDIT.sel : null) }; }
  if ((d.deco || d.frame) && S && S.fx) { const k = EDIT.sel, r = SLOTS[k]; S.fx[k] = T; snd('pop'); if (r) { lookAt(r.x + r.w / 2, r.y + r.h / 2 + (r.row === 2 ? wallShift2 : wallShift), 2.2); if (!S.asleep) go(function* () { yield* play('curious', { dir: r.x + r.w / 2 > g.x ? 1 : -1 }); yield* idleLoop(); }); } }
  save(); renderSheet();
});
/* the room is also the navigation: every object does something */
function hitSlot(x, y) {
  const inR = (r, k) => { const yy = r.row === 0 ? y : y - (r.row === 2 ? wallShift2 : wallShift); return x >= r.x - 4 && x <= r.x + r.w + 4 && yy >= r.y - 4 && yy <= r.y + r.h + 4; };
  if (y > GROUND + 12 && y < GROUND + 54 && Math.abs(x - NAMEPLATE.x) < 80) return 'nameplate';
  if (x > 446 && x < 522 && y > GROUND - 100 && y <= GROUND + 4) return 'shelf';
  if (EDIT) { if (y > GROUND - 18 && y < GROUND + 18 && Math.abs(x - MATX) < MAT_W[st.type] / 2 + 14) return 'cloth'; if (y > GROUND - 18 && y < GROUND + 20 && Math.abs(x - BOWL_X) < 72) return 'bowl'; }
  for (const [k, r] of Object.entries(SLOTS)) if (!r.hidden && inR(r, k)) return k;
  return null;
}
function showMemory(k) {
  const m = st.memories[k]; if (!m) return;
  if (S && S.fx && !$('#dInfo').open && !S.fx['g' + hm_slot(k)]) { const sl = hm_slot(k); S.fx['g' + sl] = T; snd('glint'); setTimeout(() => showMemory2(k), 420); return; }
  showMemory2(k);
}
const hm_slot = k => ['hero', 's1', 's2'].find(x => st.home.frames[x] === k);
function showMemory2(k) {
  const m = st.memories[k]; if (!m) return; if (S && S.fx) S.fx['g' + hm_slot(k)] = null; const d = Math.max(1, Math.floor((m.t - st.born) / 86400000) + 1);
  $('#infoT').replaceChildren(MEM[k].name, Object.assign(document.createElement('i'), { textContent: '.' })); $('#infoB').textContent = memText(k) + ' (day ' + d + ')'; $('#dInfo').showModal();
}
function slotTap(x, y) {
  const k = hitSlot(x, y); if (!k) return false;
  if (EDIT) { if (k === 'notebook') return true; openSheet(tabForSlot(k), ['hero', 's1', 's2', 'decoA', 'decoB'].includes(k) ? k : undefined); return true; }
  const hm = st.home;
  if (['hero', 's1', 's2'].includes(k)) { if (hm.frames[k] && st.memories[hm.frames[k]]) showMemory(hm.frames[k]); else openSheet('frames', k); return true; }
  if (k === 'notebook') { if (NOTES[0].need()) openNotes(); return true; }
  if (k === 'finds') { openSheet('finds'); return true; }
  if (k === 'nameplate') { openRename(); return true; }
  if (k === 'shelf') { openSheet('shelfObj'); return true; }
  if ((k === 'decoA' || k === 'decoB')) { if (hm[k] === 'board') openIdeas(); else if (hm[k] === 'xmr' || hm[k] === 'xmrf') openXmr(k); else if (!hm[k]) openSheet('art', k); return true; }
  return false;
}
/* xmr chart sheet: the same string, larger, with 24h / 7d, the numbers and where they come from */
let xmrRange = '24h', xmrSlot = 'decoA';
function renderXmr() {
  const { status, d } = priceProvider.view(), big = $('#xmrBig'), stats = $('#xmrStats'); stats.replaceChildren();
  const row = (k, v, href) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; if (href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = v; dd.append(a); } else dd.textContent = v; stats.append(dt, dd); };
  const card = inner => `<svg viewBox="0 0 300 150" role="img" aria-label="xmr price"><rect width="300" height="150" rx="14" fill="#f6ead5"/>${inner}</svg>`;
  if ((status === 'live' || status === 'stale') && d) {
    const sr = xmrRange === '24h' ? d.h24 : d.d7, span = xmrRange === '24h' ? 864e5 : 7 * 864e5, hi = Math.max(...sr), lo = Math.min(...sr), chg = xmrRange === '24h' ? d.change24h : d.change7d;
    const t = (x, y, txt, a = 'start') => `<text x="${x}" y="${y}" text-anchor="${a}" font-family="Albert Sans, sans-serif" font-size="10" font-weight="700" fill="#7a6a55">${ESC(txt)}</text>`;
    big.innerHTML = card(stringGraph(sr, 22, 28, 256, 78, { dim: status === 'stale', pins: xmrRange === '24h' ? 7 : 9 }) + t(22, 17, 'high ' + fmtUsd(hi)) + t(22, 124, 'low ' + fmtUsd(lo)) + t(22, 141, fmtWhen(d.updated - span)) + t(278, 141, fmtWhen(d.updated), 'end'));
    row('xmr / usd', fmtUsd(d.usd)); row('change, ' + xmrRange, chg === null || chg === undefined ? 'n/a' : fmtPct(chg)); row(status === 'stale' ? 'last updated' : 'updated', fmtWhen(d.updated)); row('source', d.source || 'unknown', d.sourceUrl);
  } else if (status === 'loading') { big.innerHTML = card(stringGraph(Array.from({ length: 12 }, (_, i) => Math.sin(i * .7) + i * .12), 22, 28, 256, 78, { p: .6 })); row('xmr / usd', 'loading'); row('source', 'waiting for the provider'); }
  else { big.innerHTML = card(slackString(22, 44, 256, 50)); row('xmr / usd', status === 'error' ? 'price unavailable' : 'not connected'); row('source', status === 'error' ? 'the provider did not answer, nothing cached' : 'no price source is connected yet'); }
  document.querySelectorAll('#dXmr [data-r]').forEach(b => b.classList.toggle('sel', b.dataset.r === xmrRange));
}
function openXmr(k) { xmrSlot = k; renderXmr(); $('#dXmr').showModal(); }
document.querySelectorAll('#dXmr [data-r]').forEach(b => { b.onclick = () => { xmrRange = b.dataset.r; renderXmr(); }; });
$('#xmrMove').onclick = () => {   /* one action: next wall-art place, then the next composition */
  const hm = st.home;
  if (hm[xmrSlot] === 'xmrf') hm.comp = (hm.comp + 1) % 3;
  else { const o = xmrSlot === 'decoA' ? 'decoB' : 'decoA', t = hm[o]; hm[o] = hm[xmrSlot]; hm[xmrSlot] = t || null; if (xmrSlot === 'decoB') hm.comp = (hm.comp + 1) % 3; xmrSlot = o; }
  applyLayout(LAYOUT_BP, hm.comp); fitView(); if (S && S.fx) S.fx[xmrSlot] = T; snd('pop'); save(); $('#dXmr').close();
};
$('#xmrRemove').onclick = () => { st.home[xmrSlot] = null; fitView(); save(); $('#dXmr').close(); };

/* grain notes: short, optional cards from the world of grainpad */
function openNotes() {
  if (S && S.fx && !EDIT && !$('#dGrainNotes').open) { S.fx.nb = T; snd('page'); setTimeout(openNotes2, 320); return; }
  openNotes2();
}
function openNotes2() {
  const box = $('#notesBody'); box.replaceChildren();
  for (const n of NOTES) {
    const c = document.createElement('div'); c.className = 'card';
    if (!n.need()) { const t = document.createElement('h3'); t.textContent = 'a note is waiting.'; c.append(t); const p = document.createElement('p'); p.className = 'small'; p.textContent = 'opens ' + n.hint + '.'; c.append(p); }
    else {
      n.body.forEach((line, i) => { const p = document.createElement(i === 0 ? 'h3' : 'p'); p.textContent = line; if (i === n.body.length - 1) p.className = 'kick'; c.append(p); });
      const a = document.createElement('a'); a.className = 'more'; a.href = n.more; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'learn more'; c.append(a);
      if (!st.notesRead.includes(n.id)) { st.notesRead.push(n.id); note('note'); unlockMemory('note'); save(); }
    }
    box.append(c);
  }
  $('#dGrainNotes').showModal();
}
function openHistory() { const ol = $('#notes'); ol.replaceChildren(); (st.notes.length ? st.notes : [{ s: 'nothing yet. give it a few visits.' }]).forEach(n => { const li = document.createElement('li'); li.textContent = n.s; ol.append(li); }); $('#dNotes').showModal(); }
/* idea board: pin what you want to build; it stays in this browser and can be taken to grainpad */
let ideasBefore = 0;
function openIdeas() { ideasBefore = st.ideas.length; renderIdeas(); $('#dIdeas').showModal(); }
function renderIdeas() {
  const ol = $('#ideaList'); ol.replaceChildren();
  if (!st.ideas.length) { const li = document.createElement('li'); li.className = 'small'; li.textContent = 'nothing pinned yet.'; ol.append(li); }
  for (const it of st.ideas.slice().reverse()) {
    const li = document.createElement('li'); const t = document.createElement('span'); t.textContent = it.s;
    const go_ = document.createElement('a'); go_.textContent = 'launch it'; go_.href = '/launch'; go_.target = '_blank'; go_.rel = 'noopener'; go_.dataset.copy = it.s;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = 'remove'; x.dataset.rm = it.id; x.className = 'mini';
    li.append(t, go_, x); ol.append(li);
  }
}
$('#pinIdea').onclick = () => {
  const inp = $('#ideaIn'), v = inp.value.replace(/\s+/g, ' ').trim().slice(0, 80); if (!v) return;
  st.ideas.push({ id: uid(), t: NOW(), s: v }); st.ideas = st.ideas.slice(-12); inp.value = ''; save(); renderIdeas();
};
$('#ideaIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#pinIdea').click(); } });
$('#ideaList').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]'); if (rm) { st.ideas = st.ideas.filter(i => i.id !== rm.dataset.rm); save(); renderIdeas(); return; }
  const a = e.target.closest('a[data-copy]'); if (a) { try { navigator.clipboard.writeText(a.dataset.copy); } catch {} }
});
$('#dIdeas').addEventListener('close', () => {
  if (S && st.ideas.length > ideasBefore && !S.asleep) go(function* () { say('noted.'); yield* play('happy'); yield* idleLoop(); }, true);
});

/* share cards: four kinds, four compositions, all drawn from the real save */
const RESTW = { mori: 269, nori: 281, pip: 211, rolo: 344, peb: 265 };   /* rest widths at scale 1, from the runtime manifest */
const PERSONA = { mori: 'careful and curious.', nori: 'tidy and welcoming.', pip: 'quick and excitable.', rolo: 'slow and easy.', peb: 'collects small things.' };
const KINDS = { meet: 'meet my grain', room: 'room update', memory: 'little memory', find: 'found this' };
let cardBlob = null, cardKind = 'meet', blendOk = null;
/* draws a tiny SVG with a multiply shape, reads the pixels back, and reports whether this browser's image export really darkened the backdrop */
async function blendRasterises() {
  if (blendOk !== null) return blendOk;
  try {
    if (!BLEND_OK) return (blendOk = false);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#d6bc92"/><rect x="20" width="20" height="20" fill="${SHADOW_MULTIPLY}" fill-opacity="${SHADOW_ALPHA}" style="mix-blend-mode:multiply"/></svg>`;
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
    const cv = document.createElement('canvas'); cv.width = 40; cv.height = 20; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const a = cx.getImageData(5, 10, 1, 1).data, b = cx.getImageData(30, 10, 1, 1).data;
    blendOk = b[0] < a[0] - 18 && b[1] < a[1] - 18 && b[2] < a[2] - 18;
  } catch { blendOk = false; }
  return blendOk;
}
const wrapText = (t, w) => { const o = []; let l = ''; for (const wd of t.split(' ')) { if ((l + ' ' + wd).trim().length > w) { o.push(l); l = wd; } else l = (l + ' ' + wd).trim(); } if (l) o.push(l); return o; };
async function openShare(kind) {
  cardKind = kind || cardKind; $('#dShare').showModal(); $('#cardImg').removeAttribute('src');
  document.querySelectorAll('#cardKinds button').forEach(b => b.classList.toggle('sel', b.dataset.kind === cardKind));
  try { cardBlob = await makeCard(cardKind); $('#cardImg').src = URL.createObjectURL(cardBlob); } catch (e) { $('#cardImg').alt = 'could not make the card here.'; }
}
const KB = $('#cardKinds'); if (KB) for (const [k, l] of Object.entries(KINDS)) { const b = document.createElement('button'); b.type = 'button'; b.dataset.kind = k; b.textContent = l; b.className = 'opt'; b.onclick = () => openShare(k); KB.append(b); }
function cardLines(kind) { /* the words on a card, built from the save only (also used by the review checks) */
  const n = st.name, hm = st.home, memIds = Object.keys(st.memories), memId = (hm.frames.hero && st.memories[hm.frames.hero]) ? hm.frames.hero : memIds.slice(-1)[0];
  if (kind === 'meet') return { head: `this is ${n}.`, sub: [PERSONA[st.type], `${n} ${GESTURE[st.type]}`] };
  if (kind === 'room') return { head: 'room update.', sub: wrapText(hm.lastPlaced ? `new: ${hm.lastPlaced.label}. ${n}'s place is coming together.` : `${n}'s place is coming together.`, 40) };
  if (kind === 'memory') { const id = memId || 'meeting', m = st.memories[id]; return { head: 'a little memory.', sub: wrapText(m ? memText(id) : `${n} is still collecting them.`, 36) }; }
  const id = st.finds.got.slice(-1)[0]; return { head: 'found this.', sub: id === undefined ? [`${n} is still looking.`] : [`${n} brought me ${FINDS[id].n}.`, FOUND_LINE[st.type](n)] };
}
async function makeCard(kind) {
  const ws = [wallShift, wallShift2], oSS = SHADOW_SOLID; wallShift = wallShift2 = 0; SHADOW_SOLID = !(await blendRasterises());   /* the export must really rasterise the multiply, otherwise it uses the computed solid colour */
  const lb = LAYOUT_BP; applyLayout('n');
  try { return await makeCard2(kind); } finally { [wallShift, wallShift2] = ws; SHADOW_SOLID = oSS; applyLayout(lb); }
}
async function makeCard2(kind) {
  const font = await fetch('albert-sans.woff2').then(r => r.arrayBuffer()).then(b => { let s = ''; new Uint8Array(b).forEach(c => s += String.fromCharCode(c)); return btoa(s); });
  const dot = s => ESC(s).replace(/\./g, '<tspan fill="#ff6600">.</tspan>');
  const oI = IDP, oU = UID, oS = SHADOW; IDP = 'card_'; UID = 0; SHADOW = SHELF_SHADOW; const grainSvg = layersSVG(renderAction(st.type, 'happy', 0.9, {})); IDP = oI; UID = oU; SHADOW = oS;
  const PX = 64, PY = 172, PW = 952, PH = 900, n = st.name, hm = st.home, w = optOf('wall', hm.wall);
  const memIds = Object.keys(st.memories), memId = (hm.frames.hero && st.memories[hm.frames.hero]) ? hm.frames.hero : memIds.slice(-1)[0];
  const floor = (y) => `<rect x="0" y="${y}" width="1080" height="14" fill="#d6bc92"/><rect x="0" y="${y + 14}" width="1080" height="200" fill="#b89a70"/>`;
  const backdrop = `<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" fill="${w.c}"/><circle cx="${PX + 200}" cy="${PY + 160}" r="420" fill="${w.glow}" opacity=".75"/>`;
  let panel = '', head = '', sub = [], small = `day ${day()}`, headSize = 52;
  if (kind === 'meet') {
    const h = new Date(NOW()).getHours(); panel = backdrop + decoAt('window', { x: PX + 70, y: PY + 54, w: 230, h: 240 }, h, 0) + (hm.shelfObj !== 'none' && optOf('shelfObj', hm.shelfObj) === CAT.shelfObj.opts[hm.shelfObj] ? `<g transform="translate(${PX + PW - 110} ${PY + PH - 112}) scale(2)">${shelfObjSvg2(hm.shelfObj)}</g>` : '') + floor(PY + PH - 110) + `<g transform="translate(${PX + PW / 2} ${PY + PH - 104}) scale(1.9)">${grainSvg}</g>`;
    head = `this is ${n}.`; headSize = clamp(74 - Math.max(0, n.length - 4) * 4, 44, 74); sub = [PERSONA[st.type], `${n} ${GESTURE[st.type]}`];
  } else if (kind === 'room') {
    const SCr = PW / 512, key = hm.lastPlaced && hm.lastPlaced.slot, r = key && SLOTS[key];
    panel = `<g transform="translate(${PX} ${PY - 52 * SCr}) scale(${SCr})">${homeSvg(false)}<g transform="translate(250 ${GROUND - 2}) scale(${SCL})">${grainSvg}</g>${r ? `<rect x="${r.x - 4}" y="${r.y - 4}" width="${r.w + 8}" height="${r.h + 8}" rx="14" fill="none" stroke="#ff6600" stroke-width="5"/>` : ''}</g>`;
    head = 'room update.'; sub = wrapText(hm.lastPlaced ? `new: ${hm.lastPlaced.label}. ${n}'s place is coming together.` : `${n}'s place is coming together.`, 40);
  } else if (kind === 'memory') {
    const id = memId || 'meeting'; panel = backdrop + `<g transform="translate(${PX + PW / 2 - 230} ${PY + 60}) scale(3.7)">${(() => { const o = SLOTS.hero; const t = SLOTS.hero; SLOTS.hero = { ...o, x: 0, y: 0 }; const s = frameAt('hero', id); SLOTS.hero = t; return s; })()}</g>` + floor(PY + PH - 90) + `<g transform="translate(${PX + PW - 190} ${PY + PH - 84}) scale(1.05)">${grainSvg}</g>`;
    head = 'a little memory.'; const m = st.memories[id]; sub = wrapText(m ? memText(id) : `${n} is still collecting them.`, 36); small = m ? `day ${Math.max(1, Math.floor((m.t - st.born) / 86400000) + 1)}` : small;
  } else {
    const id = st.finds.got.slice(-1)[0]; panel = backdrop + floor(PY + PH - 110) + (id === undefined ? '' : `<g transform="translate(${PX + 270} ${PY + PH - 100}) scale(8.5)">${findSvg(id)}</g>`) + `<g transform="translate(${PX + PW - (RESTW[st.type] * Math.min(1.6, 430 / RESTW[st.type]) / 2 + 50)} ${PY + PH - 104}) scale(${Math.min(1.6, 430 / RESTW[st.type])})">${grainSvg}</g>`;
    head = 'found this.'; sub = id === undefined ? [`${n} is still looking.`] : [`${n} brought me ${FINDS[id].n}.`, FOUND_LINE[st.type](n)];
  }
  ({ head, sub } = cardLines(kind));
  const subSvg = sub.map((l, i) => `<text x="${PX}" y="${PY + PH + 116 + i * 46}" font-size="36" style="font-weight:600">${dot(l)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><style>@font-face{font-family:AS;src:url(data:font/woff2;base64,${font});font-weight:100 900}text{font-family:AS,"Albert Sans",sans-serif;font-weight:700;letter-spacing:-.04em;fill:#1a1714}</style>
  <defs><clipPath id="cc"><rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="44"/></clipPath></defs>
  <rect width="1080" height="1350" fill="#f4ecdf"/>
  <g transform="translate(${PX} 30) scale(${96 / 1280})">${logoSvg('cd', 1280).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>
  <text x="${PX + 114}" y="98" font-size="72" style="font-weight:800">${dot('grainpet.')}</text>
  <text x="${PX + 116}" y="138" font-size="28" style="font-weight:600;fill:#5d5246">${dot('a little world by grainpad.')}</text>
  <g clip-path="url(#cc)">${panel}</g>
  <text x="${PX}" y="${PY + PH + 66}" font-size="${headSize}" style="font-weight:800">${dot(head)}</text>
  <text x="${PX + PW}" y="${PY + PH + 62}" font-size="26" text-anchor="end" style="font-weight:600;fill:#8a7d6d">${ESC(small)}</text>
  ${subSvg}
  <text x="${PX}" y="1290" font-size="28" style="font-weight:600;fill:#5d5246">grainpad.fun/grainpet</text>
  <text x="${PX + PW}" y="1290" font-size="36" text-anchor="end" style="font-weight:800">${dot('meet yours.')}</text>
  </svg>`;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; cv.getContext('2d').drawImage(img, 0, 0);
  return await new Promise(r => cv.toBlob(r, 'image/png'));
}
$('#saveCard').onclick = () => { if (!cardBlob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(cardBlob); a.download = `${st.name}-grainpet-${cardKind}.png`; a.click(); };
$('#shareBtn').onclick = async () => {
  if (!cardBlob) return; const f = new File([cardBlob], `${st.name}-grainpet-${cardKind}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: `${KINDS[cardKind]}. grainpet, a little world by grainpad. grainpad.fun/grainpet` }); } catch {} } else $('#saveCard').click();
};

/* ---------- review tools (?review=1 only) ---------- */
/* the simulated clock moves forward and the grain comes back to a room that has been left for that long, with no reload */
function returnAfter(h) {
  save(); CLOCK += h * HOUR; try { sessionStorage.setItem('grainpet.clock', String(CLOCK)); } catch {}
  noSave = false; enter();
}
if (DEV) {
  $('.app').prepend($('#dev')); $('#dev').hidden = false; $('#devToggle').onclick = () => { const b = $('#devBtns'); b.hidden = !b.hidden; };
  const bx = $('#devTypes'); TYPES.forEach(t => { const b = document.createElement('button'); b.textContent = t; b.dataset.t = t; bx.append(b); });
  $('#dev').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset.d, t = b.dataset.t;
    if (t) { noSave = true; st = newState(t); try { localStorage.setItem(LS, JSON.stringify(st)); sessionStorage.removeItem('grainpet.clock'); } catch {} location.reload(); }
    if (d && d.startsWith('away')) returnAfter(Number(d.slice(4)));
    if (d === 'reset') { noSave = true; try { localStorage.removeItem(LS); sessionStorage.removeItem('grainpet.clock'); } catch {} location.reload(); }
    if (d === 'invite') inviteRitual();
    if (d && d.startsWith('px')) { const pv = priceProvider, cur = pv.data ? pv.data.usd : 160; pv.demoSet(d === 'pxup' ? cur + 0.37 + Math.random() * 1.2 : d === 'pxdown' ? cur - 0.41 - Math.random() * 1.2 : d === 'pxbig' ? cur + 13.3 : d === 'pxsame' ? cur : d === 'pxlen' ? (cur < 100 ? 100.05 : 99.95) : cur); }
    if (d && d.startsWith('px')) { const pv = priceProvider, cur = pv.data ? pv.data.usd : 160; pv.demoSet(d === 'pxup' ? cur + 0.37 + Math.random() * 1.2 : d === 'pxdown' ? cur - 0.41 - Math.random() * 1.2 : d === 'pxbig' ? cur + 13.3 : d === 'pxsame' ? cur : d === 'pxlen' ? (cur < 100 ? 100.05 : 99.95) : cur); }
  });
  const fmt = t => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  setInterval(() => { if (st && S) $('#devInfo').innerHTML = `<b>now</b> ${fmt(NOW())} <i>(${CLOCK ? '+' + (CLOCK / HOUR).toFixed(0) + 'h sim' : 'real'})</i> &middot; <b>away</b> ${S.away.toFixed(1)}h<br><b>state ${S.tier}</b> ${TIER_NAME[S.tier]} &middot; recovery ${S.rec.toFixed(2)} &middot; hunger ${st.needs.h.toFixed(2)} &middot; view ${innerWidth}x${innerHeight}`; }, 250);
  window.__pet = { get wallShift() { return wallShift; }, get wallShift2() { return wallShift2; }, SLOTS, blendRasterises, act: (n, o) => go(function* () { yield* play(n, o); yield* idleLoop(); }, true), walk: x => go(function* () { yield* walkTo(x); yield* idleLoop(); }, true), cardLines, memText,
    get st() { return st; }, get S() { return S; }, get g() { return g; }, get JUMPINFO() { return JUMPINFO; }, returnAfter, feed, poke, restInvite, lookAt,
    art: { buildTray, frameAt, vignette, notebookSvg, matSvg, plateSvg, namePlateSvg, decoInner, DECO_SIZE, findAt, personalSvg, plantSvg, lampSvg, booksSvg, shelfObjSvg2, thumb, trayArt, CAT, LAYOUTS, MEM, FINDS, portrait, xmrCard, optOf, TYPES, PRICE_KEY, priceProvider, sceneBack },
    step(sec) { for (let i = 0; i < sec * 60; i++) tick(1 / 60); render(); } };
}

/* ---------- lockup: the header brand is a replaceable component ---------- */
/* a shared grainpad + grain lockup can register itself as window.GrainpetLockup = { render(el, ctx) } and replaces the wordmark */
/* the grainpet badge (brand/grainpet-logo-face-v1.svg), inlined so the face can blink; ids are prefixed per use */
const logoSvg = (p, size) => `<svg class="mark" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1280 1280" role="img" aria-label="grainpet"><defs><clipPath id="${p}c"><circle cx="640" cy="640" r="590"/></clipPath></defs><g clip-path="url(#${p}c)"><circle cx="640" cy="640" r="590" fill="#ff6600"/><path fill="#fff" d="M0 1010 188 832Q210 812 210 780V694C210 637 254 610 293 642L381 717Q407 741 436 718L598 647Q640 611 682 647L844 718Q873 741 899 717L987 642C1026 610 1070 637 1070 694V780Q1070 812 1092 832L1280 1010V1280H0Z"/><path fill="#1a1714" d="M0 1280V1104L598 769Q640 735 682 769L1280 1104V1280Z"/><g fill="#3c3c3c"><path d="M88 1127 453 883Q529 849 563 880Q593 905 592 963L587 1280H88Z"/><path d="M1192 1127 827 883Q751 849 717 880Q687 905 688 963L693 1280H1192Z"/></g><ellipse cx="355" cy="248" rx="85" ry="40" transform="rotate(-40 355 248)" fill="#ffdfb7"/><g class="eyes"><g fill="#1a1714"><ellipse cx="478" cy="422" rx="76" ry="94"/><ellipse cx="802" cy="422" rx="76" ry="94"/></g><g fill="#fff"><circle cx="498" cy="386" r="27"/><circle cx="456" cy="461" r="12"/><circle cx="822" cy="386" r="27"/><circle cx="780" cy="461" r="12"/></g></g><g fill="#ff8b85"><ellipse cx="396" cy="550" rx="72" ry="35"/><ellipse cx="884" cy="550" rx="72" ry="35"/></g><path d="M584 539Q640 596 696 539" fill="none" stroke="#1a1714" stroke-width="28" stroke-linecap="round"/></g></svg>`;
let logoTimer = null;
/* every ~30 s: a blink, and now and then a tiny hop. Respects reduced motion and a hidden tab. */
function animateMark(el) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
  const eyes = el.querySelector('.eyes'); if (!eyes) return;
  const blink = [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.08)', offset: .35 }, { transform: 'scaleY(1)', offset: .7 }, { transform: 'scaleY(1)' }];
  const opts = { duration: 520, easing: 'ease-in-out' }; eyes.style.transformOrigin = '640px 440px';
  eyes.animate(blink, opts); setTimeout(() => eyes.animate(blink, { ...opts, duration: 420 }), 640);
  if (Math.random() < .6) el.animate([{ transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(0) scale(1.06,.92)', offset: .2 }, { transform: 'translateY(-4px) scale(.97,1.05)', offset: .5 }, { transform: 'translateY(0) scale(1.04,.95)', offset: .8 }, { transform: 'translateY(0) scale(1,1)' }], { duration: 700, easing: 'ease-out' });
}
function mountLockup() {
  const el = $('#lockup'); if (!el) return; el.replaceChildren();
  const L = window.GrainpetLockup; if (L && typeof L.render === 'function') { try { L.render(el, { type: st && st.type }); return; } catch {} }
  el.insertAdjacentHTML('beforeend', logoSvg('hd', 34));
  const w = document.createElement('span'); w.className = 'wm'; w.append('grainpet'); const i = document.createElement('i'); i.textContent = '.'; w.append(i); el.append(w);
  clearInterval(logoTimer); setTimeout(() => animateMark(el.querySelector('.mark')), 4000); logoTimer = setInterval(() => animateMark(el.querySelector('.mark')), 30000);
}

/* ---------- boot ---------- */
function visibility() {
  if (!document.hidden) priceProvider.refresh(false);
  if (document.hidden) { save(); hiddenAt = NOW(); }
  else if (hiddenAt && NOW() - hiddenAt > 25 * 60000) { st.seen = hiddenAt; hiddenAt = 0; cur = null; pending = null; enter(); }
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', visibility); addEventListener('pagehide', save);
const boot = () => { savePrefs(); priceProvider.load(); setInterval(() => priceProvider.refresh(false), 240000); st = load() || newState();
  if (DEV && QS.get('seed')) for (const k of QS.get('seed').split(',')) {   /* review only: ?seed=tired,rich,xmr,xmrf puts a ready-made room on a phone without any tools */
    if (k === 'tired') st.needs.e = .3;
    if (k === 'rich') { st.bond.meet = 4; st.bond.play = 2; st.bond.ritual = 1; st.memories = { meeting: { t: NOW() - 4 * 864e5 }, ritual: { t: NOW() - 2 * 864e5 }, find: { t: NOW() - 864e5 } }; st.finds.got = [0, 1, 2, 3, 4]; st.finds.shown = [0, 1, 2, 3, 4]; st.home.frames = { hero: 'meeting', s1: 'ritual', s2: 'find' }; st.home.decoB = 'clock'; }
    if (k === 'xmr') { st.home.decoA = 'xmr'; if (!st.home.decoB) st.home.decoB = 'clock'; }
    if (k === 'xmrf') { st.home.decoA = 'xmrf'; if (!st.home.decoB) st.home.decoB = 'clock'; }
  } applyLayout(LAYOUT_BP); setName(); mountLockup(); buildTray(); enter(); requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); }); };
fetch('art/grain-friends.manifest.json').then(r => r.json()).then(deriveFromManifest).catch(() => {}).finally(boot);
})();