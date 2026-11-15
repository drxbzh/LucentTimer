// Offline scramble LIBRARY (not an offline generator): scrambles produced by the online generator are saved in IndexedDB.
// All record mutations and the aggregate counters are transactional. The epoch row in `meta` fences writes from operations
// that began before a library deletion, including operations running in other tabs (local flags and Web Locks are insufficient).
import { PUZZLE_IDS, DEFAULT_PUZZLE, isPuzzle, puzzleName } from './puzzles.js';
import { freshScramble } from './generators.js';
import { epochMatches } from './library-epoch.mjs';

export const CAP = 10000;
export const INITIAL_TARGET = 500;
export const BATCH = 5;
export const YIELD_MS = 150;
const GROW_PER_FRESH = 2, CREDIT_MAX = 100;
const RETRY_BASE = 30000, RETRY_MAX = 30 * 60000;
const UNSUPPORTED_RECHECK_MS = 24 * 3600000, GEN_TIMEOUT_MS = 120000;
const DB_NAME = 'lucent-scramble-library', STATE_KEY = 'ct-library-state';
const LOCK = 'lucent-library-generator', CHANNEL = 'lucent-library';
const EPOCH_KEY = 'deleteEpoch';
const VALID = /^[\t\n\r\x20-\x7E]{3,4000}$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isUnsupported = (st, p) => !!st.unsupported[p] && Date.now() - st.unsupported[p].at < UNSUPPORTED_RECHECK_MS;

function readState() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null') || {}; } catch {}
  const credits = {}, unsupported = {};
  if (s.credits && typeof s.credits === 'object') for (const p of PUZZLE_IDS) { const n = Math.floor(+s.credits[p]); if (n > 0) credits[p] = Math.min(n, CREDIT_MAX); }
  if (s.unsupported && typeof s.unsupported === 'object') for (const p of PUZZLE_IDS) { const e = s.unsupported[p]; if (e && +e.at > 0) unsupported[p] = { at: +e.at, msg: String(e.msg || '').slice(0, 160) }; }
  return { enabled: s.enabled !== false, paused: s.paused === true, initialDone: s.initialDone === true, credits, unsupported, recent: Array.isArray(s.recent) ? s.recent.filter(isPuzzle) : [] };
}
function writeState(patch) { const s = { ...readState(), ...patch }; try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {} return s; }

let hooks = { isBusy: () => false };
let selected = DEFAULT_PUZZLE, fg = 0, manual = null, looping = false, generating = false, netDown = false, deleting = false;
let unavailable = false, lastError = null, storageBlocked = false, cleared = false, persisted = null, manualNote = '';
let cache = { total: 0, bytes: 0, per: {} };
const bad = {}, stall = {}, listeners = new Set();
let emitTimer = 0, kickTimer = 0, retryTimer = 0, chan = null, waitUntil = 0, dbp = null;

function emit(broadcast) {
  if (!emitTimer) emitTimer = setTimeout(() => { emitTimer = 0; const snap = getSnapshot(); listeners.forEach(fn => { try { fn(snap); } catch {} }); }, 80);
  if (broadcast && chan) try { chan.postMessage({ t: 'changed' }); } catch {}
}
export const refresh = () => refreshCache();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function getSnapshot() {
  const st = readState(), offline = netDown || (typeof navigator !== 'undefined' && navigator.onLine === false);
  let status = 'idle';
  if (unavailable || lastError) status = 'error'; else if (st.paused) status = 'paused'; else if (generating) status = 'generating'; else if (cache.total >= CAP) status = 'full'; else if (offline) status = 'offline';
  return {
    status, error: unavailable ? 'The offline library is not available in this browser.' : lastError,
    total: cache.total, cap: CAP, bytes: cache.bytes, per: cache.per, auto: st.enabled, paused: st.paused, persisted, cleared,
    unsupported: PUZZLE_IDS.filter(p => isUnsupported(st, p)).map(p => ({ id: p, name: puzzleName(p), msg: st.unsupported[p].msg })),
    retrying: Object.entries(bad).filter(([p, b]) => b.n > 0 && !isUnsupported(st, p)).map(([p, b]) => ({ id: p, name: puzzleName(p), reason: b.reason, inSec: Math.max(0, Math.ceil((b.until - Date.now()) / 1000)) })),
    manual: manual ? { done: manual.done, total: manual.total } : null, manualNote,
  };
}

function openDb() {
  return dbp ||= new Promise((resolve, reject) => {
    if (!self.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result, store = db.createObjectStore('scrambles', { keyPath: 'seq', autoIncrement: true });
      store.createIndex('key', 'key', { unique: true }); store.createIndex('pu', ['puzzle', 'used']);
      db.createObjectStore('meta', { keyPath: 'k' });
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); dbp = null; }; db.onclose = () => { dbp = null; }; resolve(db); };
    request.onerror = () => { dbp = null; reject(request.error); };
  });
}
const req = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = ev => { ev.preventDefault(); reject(request.error); }; });
async function run(mode, fn) {
  const db = await openDb(), tx = db.transaction(['scrambles', 'meta'], mode);
  const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('Transaction aborted')); });
  done.catch(() => {});
  let out;
  try { out = await fn(tx.objectStore('scrambles'), tx.objectStore('meta')); }
  catch (error) { try { tx.abort(); } catch {} await done.catch(() => {}); throw error; }
  await done; return out;
}
const blank = () => ({ k: 'counts', total: 0, bytes: 0, per: {} });
const slot = (counts, puzzle) => counts.per[puzzle] || (counts.per[puzzle] = { u: 0, s: 0 });
const getCounts = async meta => (await req(meta.get('counts'))) || blank();
const getEpoch = async meta => { const row = await req(meta.get(EPOCH_KEY)); return row && Number.isSafeInteger(row.value) ? row.value : 0; };
async function captureEpoch() { return run('readonly', (_store, meta) => getEpoch(meta)); }
const keyOf = (p, t) => p + '|' + t.replace(/\s+/g, ' ').trim();
const recBytes = text => text.length * 3 + 120;
const isQuota = e => !!e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)));

// Expected epoch is checked inside the same readwrite transaction before ANY insert or used-flag update.
async function addScrambles(puzzle, texts, { used = false, expectedEpoch, canAdd = () => true } = {}) {
  return run('readwrite', async (store, meta) => {
    const epoch = await getEpoch(meta);
    if (!epochMatches(expectedEpoch, epoch)) return { stale: true };
    const counts = await getCounts(meta), index = store.index('key'), now = Date.now();
    let added = 0, dup = 0, full = false, blocked = false;
    for (const raw of texts) {
      const text = String(raw).trim(); if (!VALID.test(text)) continue;
      const key = keyOf(puzzle, text), existing = await req(index.get(key));
      if (existing) {
        dup++;
        if (used && existing.used === 0) { existing.used = 1; existing.usedAt = now; await req(store.put(existing)); const s = slot(counts, existing.puzzle); s.u--; s.s++; }
        continue;
      }
      if (counts.total >= CAP) { full = true; break; }
      if (!canAdd()) { blocked = true; break; }
      try { await req(store.add({ key, puzzle, text, created: now, used: used ? 1 : 0, usedAt: used ? now : 0 })); }
      catch (error) { if (error && error.name === 'ConstraintError') { dup++; continue; } throw error; }
      counts.total++; counts.bytes += recBytes(text); used ? slot(counts, puzzle).s++ : slot(counts, puzzle).u++; added++;
    }
    await req(meta.put(counts)); return { added, dup, full, blocked, counts };
  });
}

// Returning an unused item and marking it used share one transaction. If deletion wins serialization, it cannot return a cleared record.
export async function takeUnused(puzzle) {
  if (unavailable || !isPuzzle(puzzle)) return null;
  try {
    const result = await run('readwrite', async (store, meta) => {
      const cursor = await req(store.index('pu').openCursor(IDBKeyRange.only([puzzle, 0])));
      if (!cursor) return { text: null };
      const rec = cursor.value; rec.used = 1; rec.usedAt = Date.now(); await req(cursor.update(rec));
      const counts = await getCounts(meta), s = slot(counts, puzzle); s.u = Math.max(0, s.u - 1); s.s++;
      await req(meta.put(counts)); return { text: rec.text, counts };
    });
    if (result.counts) { cache = result.counts; emit(true); }
    return result.text;
  } catch (error) { if (!isQuota(error)) markUnavailable(error); return null; }
}
function markUnavailable(error) {
  if (!unavailable && error && /unavailable|SecurityError|InvalidState|UnknownError/i.test(error.name + ' ' + error.message)) { unavailable = true; emit(); }
}
async function refreshCache() { try { cache = await run('readonly', (_store, meta) => getCounts(meta)); } catch (error) { markUnavailable(error); } emit(); }
async function reconcile() {
  const state = readState();
  const result = await run('readwrite', async (store, meta) => {
    const have = await req(meta.get('counts')), total = await req(store.count());
    if (have && have.total === total) return { counts: have, total };
    const counts = blank();
    for (const rec of await req(store.getAll())) { const s = slot(counts, rec.puzzle); rec.used ? s.s++ : s.u++; counts.total++; counts.bytes += recBytes(rec.text); }
    await req(meta.put(counts)); return { counts, total };
  });
  cache = result.counts;
  if (state.initialDone && result.total === 0) { cleared = true; writeState({ initialDone: false, credits: {} }); }
}

export async function init({ isBusy, selected: selection } = {}) {
  if (isBusy) hooks.isBusy = isBusy; if (isPuzzle(selection)) selected = selection;
  try { await openDb(); await reconcile(); } catch { unavailable = true; emit(); return; }
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch {}
  try {
    chan = 'BroadcastChannel' in self ? new BroadcastChannel(CHANNEL) : null;
    if (chan) chan.onmessage = event => { if (event.data && event.data.t === 'changed') refreshCache(); if (event.data && event.data.t === 'loopEnd') kick(); };
  } catch {}
  addEventListener('online', () => { netDown = false; kick(); emit(); }); addEventListener('offline', () => emit());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); emit(); });
  addEventListener('storage', event => { if (event.key === STATE_KEY) { emit(); kick(); } });
  emit(); setTimeout(kick, 3000);
}
export function setSelected(puzzle) { if (!isPuzzle(puzzle)) return; selected = puzzle; const state = readState(); writeState({ recent: [puzzle, ...state.recent.filter(x => x !== puzzle)] }); }
export function fgPending(n) { fg = Math.max(0, fg + n); }

// Recording is independent of pause/auto-build. Capture the epoch immediately when this request begins; if deletion commits
// before the record transaction, the expected-epoch check rejects it. A genuinely later displayed scramble captures the new epoch.
export async function noteFresh(puzzle, text) {
  if (unavailable || !isPuzzle(puzzle)) return false;
  let expectedEpoch;
  try { expectedEpoch = await captureEpoch(); }
  catch (error) { lastError = 'Could not record this scramble: ' + (error.message || error); emit(); return false; }
  clearFailure(puzzle);
  try {
    const result = await addScrambles(puzzle, [text], { used: true, expectedEpoch, canAdd: () => true });
    if (result.stale) return false;
    cache = result.counts; emit(true);
  } catch (error) { if (isQuota(error)) setStorageFull(); else { lastError = 'Could not record this scramble: ' + (error.message || error); emit(); } return false; }
  const state = readState();
  if (state.enabled && !state.paused) writeState({ credits: { ...state.credits, [puzzle]: Math.min(CREDIT_MAX, (state.credits[puzzle] || 0) + GROW_PER_FRESH) } });
  clearTimeout(kickTimer); kickTimer = setTimeout(kick, 1500); return true;
}
function setBackoff(puzzle, reason) { const b = bad[puzzle] || (bad[puzzle] = { n: 0, uns: 0, until: 0, reason: '' }); b.n++; b.uns = 0; b.reason = reason; b.until = Date.now() + Math.min(RETRY_MAX, RETRY_BASE * 2 ** (b.n - 1)); }
function noteFailure(puzzle, code, error) {
  if (code === 'unsupported') {
    const b = bad[puzzle] || (bad[puzzle] = { n: 0, uns: 0, until: 0, reason: '' });
    if (++b.uns >= 2) { delete bad[puzzle]; writeState({ unsupported: { ...readState().unsupported, [puzzle]: { at: Date.now(), msg: String((error && error.message) || 'rejected by the generator').slice(0, 160) } } }); }
    else { b.n = Math.max(b.n, 1); b.reason = 'checking'; b.until = Date.now() + 3000; }
    return;
  }
  setBackoff(puzzle, code === 'timeout' ? 'timed out' : 'generator error');
}
function clearFailure(puzzle) { delete bad[puzzle]; delete stall[puzzle]; const state = readState(); if (state.unsupported[puzzle]) { const u = { ...state.unsupported }; delete u[puzzle]; writeState({ unsupported: u }); } }
function scheduleRetry(at) { clearTimeout(retryTimer); retryTimer = setTimeout(kick, Math.max(1000, at - Date.now())); }
function setStorageFull() { storageBlocked = true; lastError = 'Not enough storage space on this device. Nothing was deleted.'; emit(); }
export function pause() { writeState({ paused: true }); emit(true); }
export function resume() { storageBlocked = false; lastError = null; writeState({ paused: false }); kick(); emit(true); }
export function setAuto(on) { writeState({ enabled: !!on }); if (on) { storageBlocked = false; lastError = null; for (const k in bad) delete bad[k]; for (const k in stall) delete stall[k]; kick(); } emit(true); }
export function requestPersist() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(value => { persisted = value; emit(); }).catch(() => {}); } catch {} }
const priorityOrder = state => { const seen = new Set(), out = [], add = p => { if (isPuzzle(p) && !seen.has(p)) { seen.add(p); out.push(p); } }; add(selected); state.recent.forEach(add); PUZZLE_IDS.forEach(add); return out; };

export async function startManual() {
  if (unavailable) return false;
  await refreshCache();
  const remaining = CAP - cache.total;
  if (remaining <= 0) { manualNote = 'The library is already full.'; emit(); return false; }
  let epoch; try { epoch = await captureEpoch(); } catch (error) { lastError = 'Could not start a library build: ' + (error.message || error); emit(); return false; }
  storageBlocked = false; lastError = null; for (const k in bad) delete bad[k]; for (const k in stall) delete stall[k];
  writeState({ unsupported: {} });
  const order = priorityOrder(readState()), n = order.length, base = Math.floor(remaining / n), extra = remaining % n, quota = {};
  order.forEach((p, i) => { quota[p] = base + (i < extra ? 1 : 0); });
  manual = { epoch, total: remaining, done: 0, quota, perDone: {}, order }; manualNote = ''; requestPersist(); kick(); emit(); return true;
}
export function cancelManual() { if (manual) { manual = null; manualNote = 'Manual build cancelled.'; emit(); } }
function finishManual(note) { const m = manual; manual = null; const unsupported = PUZZLE_IDS.filter(p => isUnsupported(readState(), p)).map(puzzleName); manualNote = note || (m && unsupported.length ? 'Finished early: not supported by the generator: ' + unsupported.join(', ') + '.' : 'Manual build finished.'); }

export async function deleteAll() {
  deleting = true; manual = null; manualNote = '';
  writeState({ enabled: false, initialDone: false, credits: {} });
  try {
    await run('readwrite', async (store, meta) => {
      const epoch = await getEpoch(meta);
      await req(store.clear()); await req(meta.clear());
      await req(meta.put(blank())); await req(meta.put({ k: EPOCH_KEY, value: epoch + 1 }));
    });
    // Re-read after the commit so a valid post-delete foreground record is not hidden by a stale local blank cache.
    await refreshCache(); lastError = null; cleared = false;
    for (const k in bad) delete bad[k]; storageBlocked = false;
    emit(true); return true;
  } catch (error) {
    lastError = 'Could not delete the scramble library. Your saved records were not intentionally removed; try again. ' + (error && error.message ? error.message : '');
    emit(true); return false;
  } finally { deleting = false; }
}

export function kick() {
  if (unavailable || looping || deleting) return;
  const state = readState();
  if (state.paused || (!state.enabled && !manual) || (storageBlocked && !manual)) { emit(); return; }
  runLoop();
}
async function runLoop() {
  looping = true;
  try {
    if (navigator.locks && navigator.locks.request) await navigator.locks.request(LOCK, { ifAvailable: true }, async lock => { if (lock) await body(); });
    else await body();
  } catch (error) { if (isQuota(error)) setStorageFull(); else { lastError = 'Library error: ' + ((error && error.message) || error); } }
  finally { looping = false; generating = false; emit(); if (chan) try { chan.postMessage({ t: 'loopEnd' }); } catch {} }
}
function pickTarget(counts, state) {
  waitUntil = 0;
  const blocked = p => { if (isUnsupported(state, p)) return true; const b = bad[p]; if (b && b.until > Date.now()) { waitUntil = waitUntil ? Math.min(waitUntil, b.until) : b.until; return true; } return false; };
  if (manual) {
    for (const p of manual.order) { const need = (manual.quota[p] || 0) - (manual.perDone[p] || 0); if (need > 0 && !blocked(p)) return { puzzle: p, count: Math.min(BATCH, need, CAP - counts.total), manual: true }; }
    return null;
  }
  const order = state.initialDone ? priorityOrder(state) : ['333', ...priorityOrder(state).filter(p => p !== '333')];
  for (const p of order) { const unused = (counts.per[p] || { u: 0 }).u; if (unused < INITIAL_TARGET && !blocked(p)) return { puzzle: p, count: Math.min(BATCH, INITIAL_TARGET - unused, CAP - counts.total) }; }
  const credit = state.credits[selected];
  if (credit > 0 && !blocked(selected)) return { puzzle: selected, count: Math.min(BATCH, credit, CAP - counts.total), credit: true };
  return null;
}
async function body() {
  // Pin one epoch for the entire loop. A delete that lands during generation makes every later batch from this loop stale too.
  const expectedEpoch = manual ? manual.epoch : await captureEpoch();
  while (true) {
    const state = readState();
    if (deleting || state.paused || (!manual && !state.enabled) || (!manual && document.hidden)) return;
    if (navigator.onLine === false) { netDown = true; return; }
    if (hooks.isBusy() || fg > 0) { generating = false; await sleep(250); continue; }
    const counts = await run('readonly', (_store, meta) => getCounts(meta)); cache = counts;
    if (counts.total >= CAP) { if (manual) finishManual(); return; }
    const target = pickTarget(counts, state);
    if (!target) {
      if (waitUntil) { scheduleRetry(waitUntil); return; }
      if (manual) finishManual(); else if (!state.initialDone) writeState({ initialDone: true });
      return;
    }
    generating = true; emit(); const buffer = [];
    for (let i = 0; i < target.count; i++) {
      if (i > 0 && (hooks.isBusy() || fg > 0 || readState().paused || deleting || (!manual && document.hidden))) break;
      try { buffer.push(await freshScramble(target.puzzle, { timeoutMs: GEN_TIMEOUT_MS })); clearFailure(target.puzzle); netDown = false; }
      catch (error) { if (error && error.code === 'network') { netDown = true; scheduleRetry(Date.now() + 60000); break; } noteFailure(target.puzzle, error && error.code, error); break; }
      await sleep(0);
    }
    if (buffer.length) {
      try {
        const result = await addScrambles(target.puzzle, buffer, { used: false, expectedEpoch, canAdd: () => !deleting && (!!manual || readState().enabled) });
        if (result.stale) { if (manual) finishManual('Build stopped because the library was deleted in another tab.'); return; }
        cache = result.counts; lastError = null;
        if (manual && target.manual) { manual.done += buffer.length; manual.perDone[target.puzzle] = (manual.perDone[target.puzzle] || 0) + buffer.length; }
        if (target.credit) { const state2 = readState(); writeState({ credits: { ...state2.credits, [target.puzzle]: Math.max(0, (state2.credits[target.puzzle] || 0) - buffer.length) } }); }
        stall[target.puzzle] = result.added === 0 ? (stall[target.puzzle] || 0) + 1 : 0;
        if (stall[target.puzzle] >= 5) { stall[target.puzzle] = 0; setBackoff(target.puzzle, 'only duplicates'); }
        emit(true); if (result.blocked || result.full) { if (result.full && manual) finishManual(); return; }
      } catch (error) { if (isQuota(error)) { setStorageFull(); return; } throw error; }
    }
    if (netDown) return;
    generating = false; emit(); await sleep(YIELD_MS);
  }
}
