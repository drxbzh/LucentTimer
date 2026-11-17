// Fresh scrambles come from a pinned, locally served build of cubing.js 0.66.1
// (MPL-2.0 / GPL-3.0-or-later dual licence; used unmodified under MPL-2.0). The bundle in
// ./vendor/cubing/ generates scrambles locally in the browser inside cubing's own Web Worker,
// so generation works offline once the app has been cached. See vendor/cubing/THIRD_PARTY_NOTICES.md.
// The module is loaded on demand, so foreground scramble generation never waits for app start-up.
import { PUZZLES } from './puzzles.js';

export const CUBING_URL = './vendor/cubing/scramble.js';
let loading = null;

// Failure categories (err.code), so callers can tell a temporary problem from a permanently unsupported event:
//   'network'     the generator module/worker could not be fetched, or the browser is offline: always transient
//   'timeout'     generation did not finish in time: transient
//   'unsupported' the generator explicitly rejected the event: the only category that can lead to "unsupported"
//   'generator'   anything else (worker crash, unexpected exception, empty output): treated as transient, retried with back-off
const NETWORK = /failed to fetch|networkerror|network error|load failed|failed to load|error loading|importing a module script failed|failed to resolve module|dynamically imported module|err_internet|net::/i;
const UNSUPPORTED = /unsupported|not supported|unknown event|invalid event|no scrambler|unrecognized|not implemented|no such event|not a valid event/i;
export function classifyError(err) {
  const msg = String((err && (err.message || err.name)) || err || '');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'network';
  if (NETWORK.test(msg)) return 'network';
  if (UNSUPPORTED.test(msg)) return 'unsupported';
  return 'generator';
}
const fail = (code, message, cause) => Object.assign(new Error(message), { code, cause });
function load() {
  return loading ||= import(CUBING_URL).catch(err => { loading = null; throw fail('network', 'Could not load the scramble generator', err); });
}

// Keeps line breaks (some events return multi-line scrambles), trims stray spaces.
export const cleanScramble = s => String(s).replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();

// timeoutMs (optional): background generation passes one so a hung generator cannot stall the whole queue.
export async function freshScramble(puzzleId, { timeoutMs = 0 } = {}) {
  const p = PUZZLES.find(x => x.id === puzzleId);
  if (!p) throw fail('unsupported', 'Unsupported puzzle ' + puzzleId);
  const job = async () => {
    const mod = await load();
    if (typeof mod.randomScrambleForEvent !== 'function') throw fail('generator', 'Scramble generator has an unexpected shape');
    let alg;
    try { alg = await mod.randomScrambleForEvent(p.event); }
    catch (err) { throw fail(classifyError(err), 'Could not generate a ' + p.name + ' scramble: ' + ((err && err.message) || err), err); }
    const text = cleanScramble(alg && alg.toString ? alg.toString() : '');
    if (!text) throw fail('generator', 'Empty scramble for ' + p.name);
    return text;
  };
  if (!timeoutMs) return job();
  let t; const timer = new Promise((_, rej) => { t = setTimeout(() => rej(fail('timeout', 'Scramble generation timed out')), timeoutMs); });
  try { return await Promise.race([job(), timer]); } finally { clearTimeout(t); }
}
