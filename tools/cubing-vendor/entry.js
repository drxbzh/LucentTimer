// Entry point for the self-hosted scramble bundle in vendor/cubing.
//
// `cubing`'s published ESM keeps its search worker in a separate chunk and tries
// `import.meta.resolve()` first. Bundled output needs the esbuild-specific
// fallback instead, so the worker URL points at the emitted chunk.
import { setSearchDebug } from "cubing/search";

setSearchDebug({ prioritizeEsbuildWorkaroundForWorkerInstantiation: true });

export { randomScrambleForEvent } from "cubing/scramble";
