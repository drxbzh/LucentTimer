// The 11 WCA events Lucent Timer supports. `id` is what is stored (settings, solves, offline library);
// `event` is the cubing.js event code passed to randomScrambleForEvent. Order = order shown in the selector.
export const PUZZLES = [
  { id: '222',   name: '2×2',      event: '222' },
  { id: '333',   name: '3×3',      event: '333' },
  { id: '444',   name: '4×4',      event: '444' },
  { id: '555',   name: '5×5',      event: '555' },
  { id: '666',   name: '6×6',      event: '666' },
  { id: '777',   name: '7×7',      event: '777' },
  { id: 'clock', name: 'Clock',    event: 'clock' },
  { id: 'minx',  name: 'Megaminx', event: 'minx' },
  { id: 'pyram', name: 'Pyraminx', event: 'pyram' },
  { id: 'skewb', name: 'Skewb',    event: 'skewb' },
  { id: 'sq1',   name: 'Square-1', event: 'sq1' },
];
export const DEFAULT_PUZZLE = '333';
export const PUZZLE_IDS = PUZZLES.map(p => p.id);
export const isPuzzle = id => typeof id === 'string' && PUZZLE_IDS.includes(id);
export const puzzleName = id => (PUZZLES.find(p => p.id === id) || { name: id }).name;
