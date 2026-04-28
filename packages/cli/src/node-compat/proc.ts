/**
 * Process spawning primitives for `@agentuity/cli`.
 *
 * Replaces direct `Bun.spawn(...)` / `Bun.spawnSync(...)` calls. Two
 * shapes cover ~95% of the CLI's needs:
 *
 *   - `run(opts)` — capture-mode. Spawns a command, waits for exit,
 *     returns `{ exitCode, stdout, stderr }`. Use this when the
 *     caller wants the output as strings.
 *
 *   - `spawnInherit(opts)` — passthrough-mode. Spawns a command with
 *     stdio inherited from the parent (so the child draws to the
 *     same TTY), waits for exit, returns `{ exitCode }`. Use this
 *     for interactive subprocesses (`ssh`, `scp`, the user's dev
 *     server, etc.).
 *
 * Why a thin layer:
 *
 * - `Bun.spawn`'s API uses `{ cmd: [...], cwd, env, stdout, stderr,
 *   stdin }` with stdio mode names (`'inherit'`, `'pipe'`, `'ignore'`).
 *   `child_process.spawn` takes `(command, args, options)` with a
 *   single `stdio` triple. Translating is mechanical but verbose.
 * - `Bun.spawn`'s `proc.exited` resolves to the exit code; on Node
 *   we have to wire up the `'exit'` / `'close'` events ourselves.
 * - Capture-mode (`stdout: 'pipe'` then `proc.stdout.text()`) needs
 *   an explicit `streamConsumers.text(...)` on Node.
 *
 * Centralizing all of this keeps callers in plain
 * `await run({ cmd: [...] })` / `await spawnInherit({ cmd: [...] })`
 * shape regardless of runtime.
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { text } from 'node:stream/consumers';

/** Options for `run()` and `spawnInherit()`. */
export interface ProcOptions {
	/** Command and arguments. `cmd[0]` is the executable. */
	cmd: string[];
	/** Working directory. Defaults to the current process cwd. */
	cwd?: string;
	/** Additional / overriding environment variables. Merged onto `process.env`. */
	env?: Record<string, string | undefined>;
	/**
	 * Optional input to write to the child's stdin before reading
	 * stdout. If provided, stdin is opened in pipe mode regardless of
	 * other settings.
	 */
	stdin?: string | Buffer | Uint8Array;
	/**
	 * Whether to merge `process.env` with `env`. Defaults to `true`.
	 * Set to `false` to launch with only the explicit env (rare; use
	 * for hermetic invocations).
	 */
	inheritEnv?: boolean;
	/**
	 * Soft timeout in milliseconds. If exceeded, the child is sent
	 * SIGTERM, then SIGKILL after a grace period. The returned
	 * `timedOut` flag indicates whether the timeout fired.
	 */
	timeoutMs?: number;
}

/** Result of a `run()` call. */
export interface RunResult {
	/** Exit code, or `null` if the process was killed by a signal. */
	exitCode: number | null;
	/** Captured standard output, decoded as UTF-8. */
	stdout: string;
	/** Captured standard error, decoded as UTF-8. */
	stderr: string;
	/** True if the process was killed by `timeoutMs`. */
	timedOut: boolean;
}

/** Result of a `spawnInherit()` call. */
export interface SpawnInheritResult {
	exitCode: number | null;
}

/**
 * Spawn a process, capture its stdout/stderr, and wait for exit.
 *
 * Equivalent to Bun's
 *   `const p = Bun.spawn({ cmd, stdout: 'pipe', stderr: 'pipe' });
 *    const stdout = await new Response(p.stdout).text();
 *    const exitCode = await p.exited;`
 * but factored so each call site stays one line.
 */
export async function run(opts: ProcOptions): Promise<RunResult> {
	if (opts.cmd.length === 0) {
		throw new Error('run: cmd must not be empty');
	}
	const [command, ...args] = opts.cmd;
	const stdinMode = opts.stdin !== undefined ? 'pipe' : 'ignore';
	const child = spawn(command!, args, {
		cwd: opts.cwd,
		env: buildEnv(opts.env, opts.inheritEnv),
		stdio: [stdinMode, 'pipe', 'pipe'],
	});

	if (opts.stdin !== undefined && child.stdin) {
		const stdinChunk = typeof opts.stdin === 'string' ? Buffer.from(opts.stdin) : opts.stdin;
		child.stdin.end(stdinChunk);
	}

	const stdoutPromise = text(child.stdout as Readable);
	const stderrPromise = text(child.stderr as Readable);

	const { exitCode, timedOut } = await waitForExit(child, opts.timeoutMs);
	const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
	return { exitCode, stdout, stderr, timedOut };
}

/**
 * Spawn a process with stdio inherited from the parent and wait for
 * exit. Use this for interactive subprocesses (ssh, scp, the user's
 * dev server) where the child should draw directly to the user's
 * terminal.
 */
export async function spawnInherit(opts: ProcOptions): Promise<SpawnInheritResult> {
	if (opts.cmd.length === 0) {
		throw new Error('spawnInherit: cmd must not be empty');
	}
	const [command, ...args] = opts.cmd;
	const child = spawn(command!, args, {
		cwd: opts.cwd,
		env: buildEnv(opts.env, opts.inheritEnv),
		stdio: 'inherit',
	});
	const { exitCode } = await waitForExit(child, opts.timeoutMs);
	return { exitCode };
}

/**
 * Spawn a process detached, ignoring stdio. Caller does not wait for
 * exit. Returns the underlying `ChildProcess` handle in case the
 * caller wants to track it.
 *
 * Used for "open this URL in the browser" / "open this file in the
 * default app" kinds of operations where we want to fire-and-forget.
 */
export function spawnDetached(opts: Omit<ProcOptions, 'stdin' | 'timeoutMs'>): ChildProcess {
	if (opts.cmd.length === 0) {
		throw new Error('spawnDetached: cmd must not be empty');
	}
	const [command, ...args] = opts.cmd;
	const child = spawn(command!, args, {
		cwd: opts.cwd,
		env: buildEnv(opts.env, opts.inheritEnv),
		stdio: 'ignore',
		detached: true,
	});
	// Detach from the parent's reference graph so the parent can exit
	// without waiting for or signaling the child.
	child.unref();
	return child;
}

/**
 * Spawn a process with a writable stdin handle and capture stdout /
 * stderr. Use this for cases where the caller needs to *stream*
 * input progressively (rather than passing a fixed `stdin` chunk via
 * `run()`).
 *
 * The caller writes to `child.stdin`, then awaits `done` to get the
 * final `RunResult`.
 */
export function runStreaming(opts: Omit<ProcOptions, 'stdin'>): {
	stdin: Writable;
	done: Promise<RunResult>;
} {
	if (opts.cmd.length === 0) {
		throw new Error('runStreaming: cmd must not be empty');
	}
	const [command, ...args] = opts.cmd;
	const child = spawn(command!, args, {
		cwd: opts.cwd,
		env: buildEnv(opts.env, opts.inheritEnv),
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	if (!child.stdin) {
		throw new Error('runStreaming: failed to open stdin');
	}
	const stdoutPromise = text(child.stdout as Readable);
	const stderrPromise = text(child.stderr as Readable);
	const done = (async () => {
		const { exitCode, timedOut } = await waitForExit(child, opts.timeoutMs);
		const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
		return { exitCode, stdout, stderr, timedOut };
	})();
	return { stdin: child.stdin, done };
}

// =============================================================================
// Internal helpers
// =============================================================================

function buildEnv(
	overrides: Record<string, string | undefined> | undefined,
	inherit: boolean | undefined
): SpawnOptions['env'] {
	const inheritResolved = inherit !== false;
	if (!overrides) return inheritResolved ? process.env : {};
	const base = inheritResolved ? { ...process.env } : {};
	for (const [k, v] of Object.entries(overrides)) {
		if (v === undefined) {
			delete base[k];
		} else {
			base[k] = v;
		}
	}
	return base;
}

async function waitForExit(
	child: ChildProcess,
	timeoutMs: number | undefined
): Promise<{ exitCode: number | null; timedOut: boolean }> {
	let timedOut = false;
	let killTimer: NodeJS.Timeout | null = null;
	if (timeoutMs !== undefined) {
		killTimer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGTERM');
			// Hard-kill after a grace period if SIGTERM was ignored.
			setTimeout(() => {
				if (!child.killed) child.kill('SIGKILL');
			}, 1000).unref();
		}, timeoutMs);
		killTimer.unref();
	}

	return new Promise<{ exitCode: number | null; timedOut: boolean }>((resolve, reject) => {
		child.once('error', (err) => {
			if (killTimer) clearTimeout(killTimer);
			reject(err);
		});
		child.once('close', (code) => {
			if (killTimer) clearTimeout(killTimer);
			resolve({ exitCode: code, timedOut });
		});
	});
}
