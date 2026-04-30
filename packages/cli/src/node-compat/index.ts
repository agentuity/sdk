/**
 * Node-compatibility shim layer for `@agentuity/cli`.
 *
 * Each submodule in this directory wraps a Bun-specific API with a
 * Node 24+ native equivalent (or a small npm dependency where native
 * parity is genuinely missing). Callers import from the specific
 * submodule, never via a `Bun.X` global, so the CLI source is portable
 * across runtimes.
 *
 * This barrel re-exports everything for callers who prefer a single
 * import line, but most call sites should import directly from the
 * submodule for clearer dependencies and smaller IDE auto-import
 * suggestions.
 *
 * Phase 5 of the migration plan reduced the number of shims kept here:
 * the trivial wrappers (sleep, parseYaml/stringifyYaml, sha1Hex,
 * sha256Hex, plus several thin fs helpers) were inlined at their call
 * sites because the Node native idiom is essentially as readable as
 * the shim. What survives below is the genuinely-non-trivial group —
 * helpers that either encode project-specific semantics or
 * substantially reduce verbosity.
 */

export { pathExists, openReadStream } from './fs.ts';

export {
	run,
	spawnInherit,
	spawnDetached,
	spawnStreamingOutput,
	type ProcOptions,
	type RunResult,
	type SpawnInheritResult,
} from './proc.ts';

export { which } from './which.ts';

export { shortHash16 } from './crypto.ts';

export { readStdinText, stdinWebStream } from './stdin.ts';

export {
	runtimeKind,
	runtimeVersion,
	entryScriptPath,
	currentDir,
	gitSha,
	type RuntimeKind,
} from './runtime-info.ts';

export {
	color,
	stripAnsi,
	stringWidth,
	type ColorMode,
	type ColorSpec,
} from './ansi.ts';

export { openDatabase, type Database, type Statement } from './sqlite.ts';
