// Notation validators for the 11 WCA events. They check that a scramble LOOKS like valid output for its puzzle (token grammar,
// plausible move count, no adjacent same-face moves on cubes). They cannot prove a scramble is uniformly random.
const tok = s => String(s).trim().split(/\s+/).filter(Boolean);
const cube = (re, min, max, noRepeat = true) => s => {
  const t = tok(s), errs = [];
  if (t.length < min || t.length > max) errs.push(`move count ${t.length} outside ${min}-${max}`);
  const bad = t.filter(x => !re.test(x)); if (bad.length) errs.push('unexpected tokens: ' + bad.slice(0, 5).join(' '));
  if (noRepeat) for (let i = 1; i < t.length; i++) if (t[i][t[i].search(/[URFDLB]/)] === t[i - 1][t[i - 1].search(/[URFDLB]/)] && /^\d?[URFDLB]w?/.test(t[i]) && t[i].replace(/[2']/g, '') === t[i - 1].replace(/[2']/g, '')) { errs.push('same move twice in a row at ' + i); break; }
  return errs;
};
export const VALIDATORS = {
  '222':  cube(/^[URFDLB][2']?$/, 5, 20),
  '333':  cube(/^[URFDLB][2']?$/, 15, 30),
  '444':  cube(/^[URFDLB]w?[2']?$/, 30, 60),
  '555':  cube(/^\d?[URFDLB]w?[2']?$/, 40, 90),
  '666':  cube(/^\d?[URFDLB]w?[2']?$/, 60, 120),
  '777':  cube(/^\d?[URFDLB]w?[2']?$/, 80, 140),
  clock: s => {
    const t = tok(s), errs = [], re = /^((UR|DR|DL|UL|U|R|D|L|ALL)\d[+-]|y2|UR|DR|DL|UL)$/;
    if (t.length < 12 || t.length > 30) errs.push(`token count ${t.length} outside 12-30`);
    const bad = t.filter(x => !re.test(x)); if (bad.length) errs.push('unexpected tokens: ' + bad.slice(0, 5).join(' '));
    return errs;
  },
  minx: s => {
    const t = tok(s), errs = [], re = /^([RD](\+\+|--)|U'?)$/;
    if (t.length < 60 || t.length > 90) errs.push(`token count ${t.length} outside 60-90`);
    const bad = t.filter(x => !re.test(x)); if (bad.length) errs.push('unexpected tokens: ' + bad.slice(0, 5).join(' '));
    return errs;
  },
  pyram: s => {
    const t = tok(s), errs = [], re = /^[URLBurlb]'?$/;
    if (t.length < 8 || t.length > 16) errs.push(`move count ${t.length} outside 8-16`);
    const bad = t.filter(x => !re.test(x)); if (bad.length) errs.push('unexpected tokens: ' + bad.slice(0, 5).join(' '));
    return errs;
  },
  skewb: s => {
    const t = tok(s), errs = [], re = /^[URLB]'?$/;
    if (t.length < 6 || t.length > 14) errs.push(`move count ${t.length} outside 6-14`);
    const bad = t.filter(x => !re.test(x)); if (bad.length) errs.push('unexpected tokens: ' + bad.slice(0, 5).join(' '));
    return errs;
  },
  sq1: s => {
    const errs = [], str = String(s).trim();
    if (!/^(\/?\s*\(\s*-?\d+\s*,\s*-?\d+\s*\)\s*\/?\s*)+$/.test(str)) { errs.push('not (a,b)/(c,d)/... format'); return errs; }
    const pairs = [...str.matchAll(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g)];
    if (pairs.length < 8 || pairs.length > 20) errs.push(`pair count ${pairs.length} outside 8-20`);
    if (pairs.some(m => +m[1] < -5 || +m[1] > 6 || +m[2] < -5 || +m[2] > 6)) errs.push('turn amount outside -5..6');
    return errs;
  },
};
export function validate(id, text) {
  if (typeof text !== 'string' || !text.trim()) return ['empty output'];
  if (/undefined|null|\[object/.test(text)) return ['contains undefined/null'];
  if (!/^[\x09\x0A\x0D\x20-\x7E]+$/.test(text)) return ['non-ASCII characters'];
  const v = VALIDATORS[id]; return v ? v(text) : ['no validator for ' + id];
}
