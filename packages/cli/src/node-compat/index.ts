/**
 * Node-compatibility shim layer for `@agentuity/cli`.
 *
 * Each submodule in this directory replaces a Bun-specific API with
 * a Node 24+ native equivalent (or a small npm dependency where
 * native parity is genuinely missing — see PLAN.md \u00a77 for the dep
 * inventory). Callers import from the specific submodule, never via
 * a `Bun.X` global, so the CLI source is portable across runtimes.
 *
 * This barrel re-exports everything for callers who prefer a single
 * import line, but most call sites should import directly from the
 * submodule for clearer dependencies (and smaller IDE auto-import
 * suggestions).
 */

export {
	pathExists,
	readText,
	readJson,
	readBytes,
	fileSize,
	writeText,
	writeBytes,
	streamToFile,
	openReadStream,
	removeFile,
	copyFileTo,
} from './fs.ts';

export {
	run,
	runStreaming,
	spawnInherit,
	spawnDetached,
	type ProcOptions,
	type RunResult,
	type SpawnInheritResult,
} from './proc.ts';

export { sleep } from './timers.ts';
export { which } from './which.ts';

export { sha1Hex, sha256Hex, shortHash16 } from './crypto.ts';
export { parseYaml, stringifyYaml } from './yaml.ts';

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
