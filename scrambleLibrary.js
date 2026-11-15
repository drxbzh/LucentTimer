// Offline scramble LIBRARY (not an offline generator): scrambles produced by the online generator are saved in IndexedDB so
// they can be served when there is no connection. Nothing here invents scrambles.
//
// Database "lucent-scramble-library" (separate from the media DB):
//   scrambles  keyPath seq (auto) · {seq, key, puzzle, text, created, used:0|1, usedAt}
//              index key  (unique)        key = puzzle + '|' + whitespace-normalised text  -> DB-level duplicate prevention
//              index pu   [puzzle, used]  -> next unused scramble for a puzzle is ONE cursor step (used is 0/1: booleans are not valid keys)
//   meta       {k:'counts', total, bytes, per:{puzzle:{u,s}}}  -> O(1) global capacity / status, updated in the SAME transaction as the writes
// Every write is one readwrite transaction, so a crash/interruption leaves either the whole batch or none of it. Readwrite
// transactions on one store are serialised by the browser, which is what makes the global 10,000 cap safe across tabs.
import { PUZZLE_IDS, DEFAULT_PUZZLE, isPuzzle, puzzleName } from './puzzles.js';
import { freshScramble } from './generators.js';

export const CAP = 10000;            // absolute maximum records (used + unused) across ALL puzzles
export const INITIAL_TARGET = 500;   // initial / refill target of UNUSED scrambles per puzzle (a goal, not a limit)
export const BATCH = 5;              // scrambles generated per database write
export const YIELD_MS = 150;         // pause between batches so the main thread / generator worker are free for the timer
const GROW_PER_FRESH = 2, CREDIT_MAX = 100;
const RETRY_BASE = 30000, RETRY_MAX = 30 * 60000;          // transient failures: retry a puzzle after 30 s, doubling up to 30 min
const UNSUPPORTED_RECHECK_MS = 24 * 3600000;               // an 'unsupported' classification is re-tested after 24 h
const GEN_TIMEOUT_MS = 120000;
const DB_NAME = 'lucent-scramble-library', STATE_KEY = 'ct-library-state', LOCK = 'lucent-library-generator', CHANNEL = 'lucent-library';
const VALID = /^[\t\n\r\x20-\x7E]{3,4000}$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isUnsupported = (st, p) => !!st.unsupported[p] && Date.now() - st.unsupported[p].at < UNSUPPORTED_RECHECK_MS;

// ───────── user state (localStorage, so every tab sees pause/auto flags immediately) ─────────
function readState() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null') || {}; } catch {}
  const credits = {};
  if (s.credits && typeof s.credits === 'object') for (const p of PUZZLE_IDS) { const n = Math.floor(+s.credits[p]); if (n > 0) credits[p] = Math.min(n, CREDIT_MAX); }
  const unsupported = {};
  if (s.unsupported && typeof s.unsupported === 'object') for (const p of PUZZLE_IDS) { const e = s.unsupported[p]; if (e && +e.at > 0) unsupported[p] = { at: +e.at, msg: String(e.msg || '').slice(0, 160) }; }
  return { enabled: s.enabled !== false, paused: s.paused === true, initialDone: s.initialDone === true, credits, unsupported, recent: Array.isArray(s.recent) ? s.recent.filter(isPuzzle) : [] };
}
function writeState(patch) { const s = { ...readState(), ...patch }; try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {} return s; }

// ───────── runtime ─────────
let hooks = { isBusy: () => false };
let selected = DEFAULT_PUZZLE, fg = 0, manual = null, looping = false, generating = false, netDown = false, deleting = false;
let unavailable = false, lastError = null, storageBlocked = false, cleared = false, persisted = null, manualNote = '';
let cache = { total: 0, bytes: 0, per: {} };
const bad = {}, stall = {}, listeners = new Set();   // bad[puzzle] = {n, uns, until, reason}: TRANSIENT failure/back-off state (memory only)
let emitTimer = 0, kickTimer = 0, retryTimer = 0, chan = null, waitUntil = 0;

function emit(broadcast) {
  if (!emitTimer) emitTimer = setTimeout(() => { emitTimer = 0; const snap = getSnapshot(); listeners.forEach(fn => { try { fn(snap); } catch {} }); }, 80);
  if (broadcast && chan) try { chan.postMessage({ t: 'changed' }); } catch {}
}
export const refresh = () => refreshCache();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export function getSnapshot() {
  const st = readState(), offline = netDown || (typeof navigator !== 'undefined' && navigator.onLine === false);
  let status = 'idle';
  if (unavailable || lastError) status = 'error';
  else if (st.paused) status = 'paused';
  else if (generating) status = 'generating';
  else if (cache.total >= CAP) status = 'full';
  else if (offline) status = 'offline';
  return {
    status, error: unavailable ? 'The offline library is not available in this browser.' : lastError,
    total: cache.total, cap: CAP, bytes: cache.bytes, per: cache.per,
    auto: st.enabled, paused: st.paused, persisted, cleared,
    unsupported: PUZZLE_IDS.filter(p => isUnsupported(st, p)).map(p => ({ id: p, name: puzzleName(p), msg: st.unsupported[p].msg })),
    retrying: Object.entries(bad).filter(([p, b]) => b.n > 0 && !isUnsupported(st, p)).map(([p, b]) => ({ id: p, name: puzzleName(p), reason: b.reason, inSec: Math.max(0, Math.ceil((b.until - Date.now()) / 1000)) })),
    manual: manual ? { done: manual.done, total: manual.total } : null, manualNote,
  };
}

// ───────── IndexedDB ─────────
let dbp = null;
function openDb() {
  return dbp ||= new Promise((res, rej) => {
    if (!self.indexedDB) return rej(new Error('IndexedDB unavailable'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result, s = d.createObjectStore('scrambles', { keyPath: 'seq', autoIncrement: true });
      s.createIndex('key', 'key', { unique: true });
      s.createIndex('pu', ['puzzle', 'used']);
      d.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; d.onclose = () => { dbp = null; }; res(d); };
    r.onerror = () => { dbp = null; rej(r.error); };
  });
}
// Request -> promise. preventDefault stops a failed request (e.g. a duplicate) from aborting the whole transaction on its own.
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = ev => { ev.preventDefault(); rej(r.error); }; });
async function run(mode, fn) {
  const db = await openDb(), tx = db.transaction(['scrambles', 'meta'], mode);
  const done = new Promise((res, rej) => { tx.oncomplete = res; tx.onabort = () => rej(tx.error || new Error('Transaction aborted')); });
  done.catch(() => {});
  let out;
  try { out = await fn(tx.objectStore('scrambles'), tx.objectStore('meta')); }
  catch (e) { try { tx.abort(); } catch {} await done.catch(() => {}); throw e; }
  await done; return out;
}
const blank = () => ({ k: 'counts', total: 0, bytes: 0, per: {} });
const slot = (c, p) => c.per[p] || (c.per[p] = { u: 0, s: 0 });
const getCounts = async M => (await req(M.get('counts'))) || blank();
const keyOf = (p, t) => p + '|' + t.replace(/\s+/g, ' ').trim();
const recBytes = t => t.length * 3 + 120;   // text + key field + key index entry + per-record overhead: an ESTIMATE
const isQuota = e => !!e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)));

// Add scrambles (one transaction). used=true is for scrambles the user has already seen: if the text already exists as an
// unused record it is flipped to used (it can never be served again). canAdd() is evaluated INSIDE the transaction right
// before each insert, so deleting the library / disabling building can't be raced by an in-flight batch.
async function addScrambles(puzzle, texts, { used = false, canAdd = () => true } = {}) {
  return run('readwrite', async (S, M) => {
    const c = await getCounts(M), idx = S.index('key'), now = Date.now();
    let added = 0, dup = 0, full = false, blocked = false;
    for (const raw of texts) {
      const text = String(raw).trim();
      if (!VALID.test(text)) continue;
      const key = keyOf(puzzle, text), ex = await req(idx.get(key));
      if (ex) {
        dup++;
        if (used && ex.used === 0) { ex.used = 1; ex.usedAt = now; await req(S.put(ex)); const s = slot(c, ex.puzzle); s.u--; s.s++; }
        continue;
      }
      if (c.total >= CAP) { full = true; break; }
      if (!canAdd()) { blocked = true; break; }
      try { await req(S.add({ key, puzzle, text, created: now, used: used ? 1 : 0, usedAt: used ? now : 0 })); }
      catch (e) { if (e && e.name === 'ConstraintError') { dup++; continue; } throw e; }
      c.total++; c.bytes += recBytes(text); used ? slot(c, puzzle).s++ : slot(c, puzzle).u++; added++;
    }
    await req(M.put(c));
    return { added, dup, full, blocked, counts: c };
  });
}
// Serve the next unused scramble of a puzzle and mark it used in the same transaction (used = displayed).
export async function takeUnused(puzzle) {
  if (unavailable || !isPuzzle(puzzle)) return null;
  try {
    const r = await run('readwrite', async (S, M) => {
      const cur = await req(S.index('pu').openCursor(IDBKeyRange.only([puzzle, 0])));
      if (!cur) return { text: null };
      const rec = cur.value; rec.used = 1; rec.usedAt = Date.now();
      await req(cur.update(rec));
      const c = await getCounts(M), s = slot(c, puzzle); s.u = Math.max(0, s.u - 1); s.s++;
      await req(M.put(c));
      return { text: rec.text, counts: c };
    });
    if (r.counts) { cache = r.counts; emit(true); }
    return r.text;
  } catch (e) { if (!isQuota(e)) markUnavailable(e); return null; }
}
function markUnavailable(e) { if (!unavailable && e && /unavailable|SecurityError|InvalidState|UnknownError/i.test(e.name + ' ' + e.message)) { unavailable = true; emit(); } }
async function refreshCache() { try { cache = await run('readonly', (S, M) => getCounts(M)); } catch (e) { markUnavailable(e); } emit(); }
async function reconcile() {
  const st = readState();
  const r = await run('readwrite', async (S, M) => {
    const have = await req(M.get('counts')), n = await req(S.count());
    if (have && have.total === n) return { c: have, n };
    const c = blank();   // missing or inconsistent counters (crash, other build, eviction): rebuild once from the records
    for (const rec of await req(S.getAll())) { const s = slot(c, rec.puzzle); rec.used ? s.s++ : s.u++; c.total++; c.bytes += recBytes(rec.text); }
    await req(M.put(c));
    return { c, n, rebuilt: true, hadCounts: !!have };
  });
  cache = r.c;
  if (st.initialDone && r.n === 0) { cleared = true; writeState({ initialDone: false, credits: {} }); }   // the browser cleared our data
}

// ───────── public API ─────────
export async function init({ isBusy, selected: sel } = {}) {
  if (isBusy) hooks.isBusy = isBusy;
  if (isPuzzle(sel)) selected = sel;
  try { await openDb(); await reconcile(); } catch (e) { unavailable = true; emit(); return; }
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch {}
  try { chan = 'BroadcastChannel' in self ? new BroadcastChannel(CHANNEL) : null; if (chan) chan.onmessage = ev => { if (ev.data && ev.data.t === 'changed') refreshCache(); if (ev.data && ev.data.t === 'loopEnd') kick(); }; } catch {}
  addEventListener('online', () => { netDown = false; kick(); emit(); });
  addEventListener('offline', () => emit());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); emit(); });
  addEventListener('storage', ev => { if (ev.key === STATE_KEY) { emit(); kick(); } });
  emit();
  setTimeout(kick, 3000);   // first-run population starts a few seconds after load, never during start-up
}
export function setSelected(p) { if (!isPuzzle(p)) return; selected = p; const st = readState(); writeState({ recent: [p, ...st.recent.filter(x => x !== p)] }); }
export function fgPending(n) { fg = Math.max(0, fg + n); }

// Called after a FRESH online scramble has been displayed.
// (1) RECORDING what the user has seen is separate from background generation: it is NOT affected by pause or by "build
//     automatically" being off, because those only govern generating extra scrambles. The record is always written as used (an
//     existing unused duplicate is flipped to used). The only thing that blocks an insert is an in-progress library deletion, and
//     the library capacity. Nothing here generates anything or switches automatic building back on.
// (2) Extra background work (credits + kick) is requested only when automatic building is on and not paused; kick() re-checks.
export function noteFresh(puzzle, text) {
  if (unavailable || !isPuzzle(puzzle)) return;
  clearFailure(puzzle);   // a successful fresh scramble is proof this puzzle is supported and currently working
  addScrambles(puzzle, [text], { used: true, canAdd: () => !deleting }).then(r => { cache = r.counts; emit(true); }).catch(e => { if (isQuota(e)) setStorageFull(); else markUnavailable(e); });
  const st = readState();
  if (st.enabled && !st.paused) writeState({ credits: { ...st.credits, [puzzle]: Math.min(CREDIT_MAX, (st.credits[puzzle] || 0) + GROW_PER_FRESH) } });
  clearTimeout(kickTimer); kickTimer = setTimeout(kick, 1500);
}
// ───────── generator failure bookkeeping ─────────
// Transient failures (generator errors, timeouts, stalls) only back a puzzle off in memory and are retried automatically; they never
// make a puzzle "unsupported". Only a generator that explicitly rejects the event, twice in a row while online, is classified
// unsupported (saved, shown in the status, re-tested after 24 h or by a manual build). Network failures count against nothing.
function setBackoff(p, reason) { const b = bad[p] || (bad[p] = { n: 0, uns: 0, until: 0, reason: '' }); b.n++; b.uns = 0; b.reason = reason; b.until = Date.now() + Math.min(RETRY_MAX, RETRY_BASE * 2 ** (b.n - 1)); }
function noteFailure(p, code, err) {
  if (code === 'unsupported') {
    const b = bad[p] || (bad[p] = { n: 0, uns: 0, until: 0, reason: '' });
    if (++b.uns >= 2) { delete bad[p]; writeState({ unsupported: { ...readState().unsupported, [p]: { at: Date.now(), msg: String((err && err.message) || 'rejected by the generator').slice(0, 160) } } }); }
    else { b.n = Math.max(b.n, 1); b.reason = 'checking'; b.until = Date.now() + 3000; }   // confirm once before classifying
    return;
  }
  setBackoff(p, code === 'timeout' ? 'timed out' : 'generator error');
}
function clearFailure(p) {
  delete bad[p]; delete stall[p];
  const st = readState(); if (st.unsupported[p]) { const u = { ...st.unsupported }; delete u[p]; writeState({ unsupported: u }); }
}
function scheduleRetry(at) { clearTimeout(retryTimer); retryTimer = setTimeout(kick, Math.max(1000, at - Date.now())); }
function setStorageFull() { storageBlocked = true; lastError = 'Not enough storage space on this device. Nothing was deleted.'; emit(); }

export function pause() { writeState({ paused: true }); emit(true); }
export function resume() { storageBlocked = false; lastError = null; writeState({ paused: false }); kick(); emit(true); }
export function setAuto(on) { writeState({ enabled: !!on }); if (on) { storageBlocked = false; lastError = null; for (const k in bad) delete bad[k]; for (const k in stall) delete stall[k]; kick(); } emit(true); }
export function requestPersist() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(v => { persisted = v; emit(); }).catch(() => {}); } catch {} }

const priorityOrder = st => { const seen = new Set(), out = [], add = p => { if (isPuzzle(p) && !seen.has(p)) { seen.add(p); out.push(p); } }; add(selected); st.recent.forEach(add); PUZZLE_IDS.forEach(add); return out; };

export async function startManual() {
  if (unavailable) return false;
  await refreshCache();
  const remaining = CAP - cache.total;
  if (remaining <= 0) { manualNote = 'The library is already full.'; emit(); return false; }
  storageBlocked = false; lastError = null; for (const k in bad) delete bad[k]; for (const k in stall) delete stall[k];
  writeState({ unsupported: {} });   // an explicit manual build re-tests puzzles that were classified unsupported
  const order = priorityOrder(readState()), n = order.length, base = Math.floor(remaining / n), extra = remaining % n, quota = {};
  order.forEach((p, i) => { quota[p] = base + (i < extra ? 1 : 0); });   // remaining capacity split across all puzzles; selected/recent get the remainder first
  manual = { total: remaining, done: 0, quota, perDone: {}, order }; manualNote = '';
  requestPersist();
  kick(); emit(); return true;
}
export function cancelManual() { if (manual) { manual = null; manualNote = 'Manual build cancelled.'; emit(); } }
function finishManual() {
  const m = manual; manual = null; const un = PUZZLE_IDS.filter(p => isUnsupported(readState(), p)).map(puzzleName);
  manualNote = m && un.length ? 'Finished early: not supported by the generator: ' + un.join(', ') + '.' : 'Manual build finished.';
}

export async function deleteAll() {
  deleting = true; manual = null; manualNote = '';
  writeState({ enabled: false, initialDone: false, credits: {} });   // automatic rebuilding stays off until the user turns it on again
  try { await run('readwrite', async (S, M) => { await req(S.clear()); await req(M.clear()); await req(M.put(blank())); }); cache = blank(); lastError = null; cleared = false; for (const k in bad) delete bad[k]; storageBlocked = false; }
  finally { deleting = false; }
  emit(true);
}

// ───────── background generation loop ─────────
export function kick() {
  if (unavailable || looping || deleting) return;
  const st = readState();
  if (st.paused || (!st.enabled && !manual) || (storageBlocked && !manual)) { emit(); return; }
  runLoop();
}
async function runLoop() {
  looping = true;
  try {
    if (navigator.locks && navigator.locks.request) await navigator.locks.request(LOCK, { ifAvailable: true }, async lock => { if (lock) await body(); });
    else await body();
  } catch (e) { if (isQuota(e)) setStorageFull(); else { lastError = 'Library error: ' + ((e && e.message) || e); } }
  finally { looping = false; generating = false; emit(); if (chan) try { chan.postMessage({ t: 'loopEnd' }); } catch {} }
}
// Next puzzle that needs scrambles. Unsupported puzzles and puzzles in transient back-off are skipped, so one failing generator
// never holds the others up. If skipped puzzles still need work, waitUntil tells the loop when to try again.
function pickTarget(c, st) {
  waitUntil = 0;
  const blocked = p => { if (isUnsupported(st, p)) return true; const b = bad[p]; if (b && b.until > Date.now()) { waitUntil = waitUntil ? Math.min(waitUntil, b.until) : b.until; return true; } return false; };
  if (manual) {
    for (const p of manual.order) { const need = (manual.quota[p] || 0) - (manual.perDone[p] || 0); if (need > 0 && !blocked(p)) return { puzzle: p, count: Math.min(BATCH, need, CAP - c.total), manual: true }; }
    return null;
  }
  const order = st.initialDone ? priorityOrder(st) : ['333', ...priorityOrder(st).filter(p => p !== '333')];   // first fill: 3×3, then the rest
  for (const p of order) { const u = (c.per[p] || { u: 0 }).u; if (u < INITIAL_TARGET && !blocked(p)) return { puzzle: p, count: Math.min(BATCH, INITIAL_TARGET - u, CAP - c.total) }; }
  const cr = st.credits[selected];   // growing archive: every fresh online scramble earns a little extra for the puzzle being used
  if (cr > 0 && !blocked(selected)) return { puzzle: selected, count: Math.min(BATCH, cr, CAP - c.total), credit: true };
  return null;
}
async function body() {
  while (true) {
    const st = readState();
    if (deleting || st.paused) return;
    if (!manual && !st.enabled) return;
    if (!manual && document.hidden) return;                       // automatic work never runs in a background tab
    if (navigator.onLine === false) { netDown = true; return; }
    if (hooks.isBusy() || fg > 0) { generating = false; await sleep(250); continue; }   // yield to solving and to a foreground scramble
    let c; try { c = await run('readonly', (S, M) => getCounts(M)); } catch (e) { throw e; }
    cache = c;
    if (c.total >= CAP) { if (manual) finishManual(); return; }
    const t = pickTarget(c, st);
    if (!t) {
      if (waitUntil) { scheduleRetry(waitUntil); return; }                       // only back-off puzzles are left: try again later
      if (manual) finishManual();
      else if (!st.initialDone) writeState({ initialDone: true });             // every eligible puzzle reached its target or is explicitly unsupported
      return;
    }
    generating = true; emit();
    const buf = [];
    for (let i = 0; i < t.count; i++) {
      if (i > 0 && (hooks.isBusy() || fg > 0 || readState().paused || deleting || (!manual && document.hidden))) break;
      try { buf.push(await freshScramble(t.puzzle, { timeoutMs: GEN_TIMEOUT_MS })); clearFailure(t.puzzle); netDown = false; }
      catch (err) {
        if (err && err.code === 'network') { netDown = true; scheduleRetry(Date.now() + 60000); break; }   // offline / generator not reachable: nothing is counted against the puzzle; try again in a minute
        noteFailure(t.puzzle, err && err.code, err); break;
      }
      await sleep(0);
    }
    if (buf.length) {
      try {
        const r = await addScrambles(t.puzzle, buf, { used: false, canAdd: () => !deleting && (!!manual || readState().enabled) });
        cache = r.counts; lastError = null;
        if (manual && t.manual) { manual.done += buf.length; manual.perDone[t.puzzle] = (manual.perDone[t.puzzle] || 0) + buf.length; }
        if (t.credit) { const s2 = readState(); writeState({ credits: { ...s2.credits, [t.puzzle]: Math.max(0, (s2.credits[t.puzzle] || 0) - buf.length) } }); }
        // A puzzle whose batches keep adding nothing (all duplicates) is skipped instead of spinning forever.
        stall[t.puzzle] = r.added === 0 ? (stall[t.puzzle] || 0) + 1 : 0;
        if (stall[t.puzzle] >= 5) { stall[t.puzzle] = 0; setBackoff(t.puzzle, 'only duplicates'); }
        emit(true);
        if (r.blocked || r.full) { if (r.full && manual) finishManual(); return; }
      } catch (e) { if (isQuota(e)) { setStorageFull(); return; } throw e; }
    }
    if (netDown) return;
    generating = false; emit();
    await sleep(YIELD_MS);
  }
}
