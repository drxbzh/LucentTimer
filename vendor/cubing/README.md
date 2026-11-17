# `vendor/cubing`

Locally served, pinned build of **cubing.js 0.66.1** used by `generators.js`.
It generates all 11 WCA event scrambles in the browser inside cubing's own Web
Worker, with no network access after the files are cached.

Generated files (do not edit):

- `scramble.js` — ES module entry; exports `randomScrambleForEvent`
- `chunks/` — cubing's worker, solver, puzzle and WASM-in-JS chunks
- `assets.js` — `self.CUBING_ASSETS`, the exact runtime file list loaded by `sw.js`
- `manifest.json` — versions, worker chunk, sizes and every bundled input

Maintained files:

- `README.md`, `THIRD_PARTY_NOTICES.md`
- `LICENSE-MPL-2.0.md`, `LICENSE-GPL-3.0-or-later.md`, `LICENSE-Apache-2.0.txt`,
  `LICENSE-MIT.txt`, `UNLICENSE.txt`

## Rebuild

```sh
cd tools/cubing-vendor
npm ci
npm run build
```

The build script refuses to succeed if any output keeps a bare import, points at
a missing chunk, drops the comlink licence notice, or loses the search-worker
chunk. `sw.js` picks up the file list from `assets.js`, so adding or renaming
chunks does not require editing the service worker.

## Licence

cubing.js is MPL-2.0 OR GPL-3.0-or-later; this app uses it under MPL-2.0.
See `THIRD_PARTY_NOTICES.md` for all bundled third-party code and licence texts.
