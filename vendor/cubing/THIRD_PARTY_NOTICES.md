# Third-party notices: `vendor/cubing`

This folder contains the locally served scramble generator used by Lucent Timer.
It is built from the pinned npm package `cubing@0.66.1` by
`tools/cubing-vendor/build.mjs`. The browser loads only these local files; there is
no runtime request to `cdn.cubing.net` or any other origin.

`manifest.json` records the exact package versions, every bundled source file
(`inputs`), the worker chunk, and the size of every emitted file.

## cubing.js 0.66.1 — MPL-2.0 OR GPL-3.0-or-later

- Project: cubing.js ("A collection of JavaScript cubing libraries")
- Upstream source: <https://github.com/cubing/cubing.js/tree/v0.66.1>
- Published package: <https://www.npmjs.com/package/cubing/v/0.66.1>
- Licence: `MPL-2.0 OR GPL-3.0-or-later`. Lucent Timer uses cubing.js under
  **MPL-2.0**. The full texts are in `LICENSE-MPL-2.0.md` and,
  for the alternative, `LICENSE-GPL-3.0-or-later.md`.
- Scramble algorithms by Chen Shuang, Lucas Garron, Tom Rokicki and others.
- Modifications: no edits to cubing.js source. Its published `dist/lib` ES modules
  are bundled and minified by esbuild; `tools/cubing-vendor/entry.js` only enables
  cubing's esbuild worker path and re-exports `randomScrambleForEvent`.
- Source Code Form: the MPL-covered source is the published `cubing@0.66.1`
  package and the tagged repository above. It can be rebuilt with the included
  `tools/cubing-vendor` package (`npm ci && npm run build`). This satisfies the
  MPL requirement to make the Source Code Form available by reasonable means.
- The Cubing logo and name are trademarks of their respective owners.

## comlink — Apache-2.0

- Original project: comlink (<https://github.com/GoogleChromeLabs/comlink>),
  repackaged for cubing.js as `@cubing/comlink-everywhere`.
- Copyright 2019 Google LLC. Licensed under the Apache License, Version 2.0.
- This code is embedded inside cubing.js's published chunks, not installed as a
  separate runtime package. Its `@license` notice is preserved in the emitted
  bundle (search for `Copyright 2019 Google LLC`).
- Full text: `LICENSE-Apache-2.0.txt`.

## @cubing/lazy-promise 0.1.3 — MIT

- Upstream: <https://codeberg.org/cubing/lazy-promise>
- Author: Lucas Garron. The package declares `"license": "MIT"` in its
  `package.json`; the repository does not ship a separate licence file.
- The code is embedded in cubing.js's published chunks and therefore in this
  bundle. Full MIT text and copyright line: `LICENSE-MIT.txt`.

## random-uint-below 3.3.0 — Unlicense

- Upstream: <https://github.com/lgarron/random-uint-below.js>
- Released into the public domain under the Unlicense.
- This is the only non-cubing npm package compiled directly into the bundle.
- Full text: `UNLICENSE.txt`.

## Not present in the bundle

`three`, `type-fest`, `@optique/core`, `@optique/run` and the `@types/*`
packages are declared by the cubing package or its tooling, but none of their
code is included in the emitted files. `manifest.json` → `inputs` lists every
source that was compiled: cubing's `dist/lib` chunks plus
`random-uint-below/dist/esm/index.js`.
