// Helpers shared by the library's transactional epoch fence and its focused tests.
// A missing/invalid epoch is always rejected; this is deliberately fail-closed.
export function epochMatches(expected, current) {
  return Number.isSafeInteger(expected) && expected >= 0 &&
    Number.isSafeInteger(current) && current >= 0 && expected === current;
}

// A foreground request takes its epoch snapshot when it starts. The app calls
// Library.fgPending(1) before awaiting cubing.js and Library.noteFresh() only
// after the scramble has actually been shown. Latest-request-wins mirrors the
// scrambleToken guard in app.js, which suppresses results from superseded requests.
const foreground = [];
export function beginForegroundEpoch(readEpoch) {
  const entry = { id: Symbol('foreground-scramble'), epoch: Promise.resolve().then(readEpoch) };
  foreground.push(entry);
  while (foreground.length > 64) foreground.shift();
  return entry.id;
}
export async function takeForegroundEpoch() {
  const entry = foreground.pop();
  foreground.length = 0;
  if (!entry) return null;
  try { return await entry.epoch; } catch { return null; }
}
