# `tools/cubing-vendor`

Build tooling for the self-hosted scramble bundle in `vendor/cubing`. It is not
part of the app runtime: the browser never loads anything from this folder.

- `entry.js` — the only source we add; enables cubing's esbuild worker path and
  re-exports `randomScrambleForEvent`
- `build.mjs` — esbuild build, output verification, `assets.js` and
  `manifest.json` generation
- `package.json` — pinned `cubing@0.66.1` and `esbuild@0.28.2`
- `package-lock.json` — pins the full transitive dependency tree

## Why esbuild

cubing's published chunks contain a real bare import
(`random-uint-below`), which a browser cannot resolve from a plain copied
folder. esbuild resolves it, emits cubing's dynamically imported chunks, and
emits the module Web Worker. cubing.js provides
`setSearchDebug({ prioritizeEsbuildWorkaroundForWorkerInstantiation: true })`
for exactly this case, so the worker URL is the emitted
`chunks/search-worker-entry-*.js` file.

## Build

```sh
npm ci
npm run build
```

`node_modules/` is intentionally ignored; only the built output under
`vendor/cubing` is committed. The app remains a static, browser-native site.

## Licence

`cubing` is MPL-2.0 OR GPL-3.0-or-later; this app uses it under MPL-2.0.
See `../../vendor/cubing/THIRD_PARTY_NOTICES.md`.
