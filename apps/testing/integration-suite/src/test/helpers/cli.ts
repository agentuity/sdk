/**
 * CLI Helper
 *
 * Utilities for executing Agentuity CLI commands via subprocess.
 * Uses Bun.spawn for subprocess execution with JSON output parsing.
 */

import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';

// Debug logging - only enabled in CI
const DEBUG = process.env.CI === 'true';
const debug = (msg: string) => {
	if (DEBUG) console.log(`[CLI] ${msg}`);
};

// Find monorepo root by walking up until we find package.json with workspaces
function findMonorepoRoot(startDir: string): string | null {
	let currentDir = startDir;
	while (true) {
		const pkgPath = join(currentDir, 'package.json');
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
				if (pkg.workspaces) {
					return currentDir;
				}
			} catch {
				// Ignore parse errors, continue searching
			}
		}
		const parent = resolve(currentDir, '..');
		if (parent === currentDir) break; // reached filesystem root
		currentDir = parent;
	}
	return null;
}

// Find project directory (directory containing agentuity.json)
function findProjectDir(startDir: string): string | null {
	let currentDir = startDir;
	while (true) {
		const configPath = join(currentDir, 'agentuity.json');
		if (existsSync(configPath)) {
			return currentDir;
		}
		const parent = resolve(currentDir, '..');
		if (parent === currentDir) break; // reached filesystem root
		currentDir = parent;
	}
	return null;
}

// Resolve CLI binary path - prioritizes installed CLI from node_modules
function resolveCliPath(): string {
	// First check for CLI installed in node_modules (tarball install in CI)
	// This is the correct path when SDK is installed from tarballs
	const projectDir = findProjectDir(process.cwd()) || findProjectDir(import.meta.dir);
	if (projectDir) {
		const installedCliPath = join(projectDir, 'node_modules/@agentuity/cli/bin/cli.ts');
		if (existsSync(installedCliPath)) {
			return installedCliPath;
		}
	}

	// Fall back to monorepo source (local development with workspace links)
	const rootFromFile = findMonorepoRoot(import.meta.dir);
	if (rootFromFile) {
		const cliPath = join(rootFromFile, 'packages/cli/bin/cli.ts');
		if (existsSync(cliPath)) {
			return cliPath;
		}
	}

	// Fall back to process.cwd() (built environment running from .agentuity)
	const rootFromCwd = findMonorepoRoot(process.cwd());
	if (rootFromCwd) {
		const cliPath = join(rootFromCwd, 'packages/cli/bin/cli.ts');
		if (existsSync(cliPath)) {
			return cliPath;
		}
	}

	throw new Error(
		`CLI not found. Searched in node_modules, from ${import.meta.dir} (root: ${rootFromFile}) and ${process.cwd()} (root: ${rootFromCwd})`
	);
}

const CLI_PATH = resolveCliPath();

// Find the project directory containing agentuity.json
// This is needed because the test server runs from .agentuity/ but CLI needs the parent
const PROJECT_DIR =
	findProjectDir(process.cwd()) || findProjectDir(import.meta.dir) || process.cwd();

// Log CLI path once at startup (only in CI)
debug(`CLI_PATH: ${CLI_PATH}`);
debug(`PROJECT_DIR: ${PROJECT_DIR}`);

export interface CLIResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	json?: any;
}

/**
 * Execute CLI command and return result
 * Commands are run from the project directory (containing agentuity.json)
 * Uses the profile from AGENTUITY_PROFILE env var if set, otherwise CLI defaults
 *
 * Note: We set environment variables to skip startup checks:
 * - AGENTUITY_SKIP_LEGACY_CHECK=1 - Skip legacy CLI detection that could exit(1)
 * - AGENTUITY_SKIP_VERSION_CHECK=1 - Skip version check network requests
 */
export async function runCLI(args: string[]): Promise<CLIResult> {
	// Create environment with skip flags (using env vars instead of CLI flags
	// because Commander.js would fail on unknown options)
	const env = {
		...process.env,
		AGENTUITY_SKIP_LEGACY_CHECK: '1',
		AGENTUITY_SKIP_VERSION_CHECK: '1',
	};

	try {
		// Use Bun.spawn instead of Bun.$ for more reliable subprocess execution
		// Bun.$ has issues with array argument expansion in some environments
		const cmd = ['bun', CLI_PATH, ...args];

		const proc = Bun.spawn(cmd, {
			cwd: PROJECT_DIR,
			env,
			stdout: 'pipe',
			stderr: 'pipe',
		});

		// Read stdout and stderr
		const stdoutChunks: Uint8Array[] = [];
		const stderrChunks: Uint8Array[] = [];

		if (proc.stdout) {
			const reader = proc.stdout.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				stdoutChunks.push(value);
			}
		}

		if (proc.stderr) {
			const reader = proc.stderr.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				stderrChunks.push(value);
			}
		}

		const exitCode = await proc.exited;

		// Combine chunks into strings
		const stdout = new TextDecoder().decode(
			new Uint8Array(stdoutChunks.reduce((acc, chunk) => [...acc, ...chunk], [] as number[]))
		);
		const stderr = new TextDecoder().decode(
			new Uint8Array(stderrChunks.reduce((acc, chunk) => [...acc, ...chunk], [] as number[]))
		);

		// Log failures in CI for debugging
		if (exitCode !== 0) {
			debug(`Command failed: ${args.join(' ')} (exit ${exitCode})`);
			if (stderr) debug(`stderr: ${stderr.slice(0, 200)}`);
		}

		return { stdout, stderr, exitCode };
	} catch (error: any) {
		debug(`Error: ${error.message}`);
		return {
			stdout: '',
			stderr: error.message || 'Unknown error',
			exitCode: 1,
		};
	}
}

/**
 * Execute CLI command and parse JSON output
 */
export async function runCLIJSON(args: string[]): Promise<CLIResult> {
	const result = await runCLI([...args, '--json']);

	if (result.exitCode === 0 && result.stdout) {
		try {
			result.json = JSON.parse(result.stdout);
		} catch {
			// JSON parsing failed, leave json undefined
		}
	}

	return result;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
	const result = await runCLI(['auth', 'whoami']);
	return result.exitCode === 0;
}

/**
 * Get current profile
 */
export async function getCurrentProfile(): Promise<string> {
	const result = await runCLI(['profile', 'current']);
	return result.stdout.trim();
}

/**
 * Extract deployment ID from deploy output
 */
export function extractDeploymentId(output: string): string | null {
	const match = output.match(/deploy_[a-zA-Z0-9]+/);
	return match ? match[0] : null;
}

/**
 * Extract agent ID from output
 */
export function extractAgentId(output: string): string | null {
	const match = output.match(/agent_[a-f0-9]{40}/);
	return match ? match[0] : null;
}

/**
 * Extract session ID from output
 */
export function extractSessionId(output: string): string | null {
	const match = output.match(/sess_[a-f0-9]+/);
	return match ? match[0] : null;
}
