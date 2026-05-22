/**
 * Git helper utilities for detecting and using git safely.
 *
 * On macOS, git may be a stub that triggers Xcode Command Line Tools
 * installation popup. This helper detects the real git binary and
 * provides safe wrappers.
 *
 * Centralizes every CLI invocation of the `git` binary behind the
 * `runGit()` helper below. Call sites that previously did
 * `Bun.spawnSync(['git', ...])` ad-hoc now go through `runGit()`,
 * which gives us a single migration target if we ever want to swap
 * the underlying spawn machinery (e.g. between
 * `node:child_process`, `bun:spawn`, or a libgit2 binding).
 */

import { run } from './node-compat/proc.ts';
import { which } from './node-compat/which.ts';

/** Result of a `runGit()` call. */
export interface GitResult {
	/** Whether the command exited 0. */
	ok: boolean;
	/** Exit code, or `null` if killed by signal. */
	exitCode: number | null;
	/** Captured stdout (UTF-8). Trimmed of trailing whitespace. */
	stdout: string;
	/** Captured stderr (UTF-8). Trimmed of trailing whitespace. */
	stderr: string;
}

/** Options for `runGit()`. */
export interface RunGitOptions {
	/** Working directory for the git invocation. */
	cwd?: string;
	/** Soft timeout in milliseconds. */
	timeoutMs?: number;
}

/**
 * Run `git <args...>` and return the captured result. Replaces the
 * scattered `Bun.spawnSync(['git', ...])` calls that used to live in
 * many places.
 *
 * The shell invocation is **not** routed through a real shell, so
 * caller arguments are passed verbatim — there's no quoting or
 * expansion to worry about. URLs, branch names, and refs containing
 * shell metacharacters are safe.
 *
 * Errors from spawning itself (e.g. `git` not on PATH) are returned
 * as `{ ok: false, exitCode: null, stderr: <message> }` rather than
 * thrown, since most callers want to fall through gracefully when
 * git is missing or stubbed.
 */
export async function runGit(args: string[], opts: RunGitOptions = {}): Promise<GitResult> {
	try {
		const result = await run({
			cmd: ['git', ...args],
			cwd: opts.cwd,
			timeoutMs: opts.timeoutMs,
		});
		return {
			ok: result.exitCode === 0,
			exitCode: result.exitCode,
			stdout: result.stdout.trimEnd(),
			stderr: result.stderr.trimEnd(),
		};
	} catch (err) {
		return {
			ok: false,
			exitCode: null,
			stdout: '',
			stderr: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Check if git is available and is the real git binary (not the
 * macOS stub).
 *
 * On macOS without Xcode CLT installed, /usr/bin/git exists but it's
 * a stub that triggers a popup asking to install developer tools.
 * We detect this by checking if Xcode Command Line Tools are
 * installed using `xcode-select -p`.
 */
export async function isGitAvailable(): Promise<boolean> {
	if (!(await which('git'))) {
		return false;
	}

	// On macOS, check if Xcode Command Line Tools are installed.
	// xcode-select -p returns 0 if tools are installed, non-zero
	// otherwise; if the tools are missing, /usr/bin/git is a stub.
	if (process.platform === 'darwin') {
		const xcs = await run({ cmd: ['xcode-select', '-p'] }).catch(() => null);
		if (!xcs || xcs.exitCode !== 0) {
			return false;
		}
	}

	// On other platforms (and on macOS with CLT installed), just
	// verify git actually works.
	const result = await runGit(['--version']);
	return result.ok;
}

/**
 * Get the default branch name from git config, or `'main'` as
 * fallback. Returns `null` if git is not available.
 */
export async function getDefaultBranch(): Promise<string | null> {
	if (!(await isGitAvailable())) {
		return null;
	}

	const result = await runGit(['config', '--global', 'init.defaultBranch']);
	if (result.ok) {
		return result.stdout || 'main';
	}
	return 'main';
}
