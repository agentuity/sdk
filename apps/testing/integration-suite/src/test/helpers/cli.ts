/**
 * CLI Helper
 *
 * Utilities for executing Agentuity CLI commands via subprocess.
 * Uses Bun.$ for subprocess execution with JSON output parsing.
 */

import { $ } from 'bun';
import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';

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

// Resolve CLI binary path - works in both dev and built (.agentuity) environments
function resolveCliPath(): string {
	// Try from import.meta.dir first (dev environment)
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
		`CLI not found. Searched from ${import.meta.dir} (root: ${rootFromFile}) and ${process.cwd()} (root: ${rootFromCwd})`
	);
}

const CLI_PATH = resolveCliPath();

// Find the project directory containing agentuity.json
// This is needed because the test server runs from .agentuity/ but CLI needs the parent
const PROJECT_DIR =
	findProjectDir(process.cwd()) || findProjectDir(import.meta.dir) || process.cwd();

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
 */
export async function runCLI(args: string[]): Promise<CLIResult> {
	try {
		const result = await $`bun ${CLI_PATH} ${args}`.cwd(PROJECT_DIR).env(process.env).quiet();

		return {
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
			exitCode: result.exitCode,
		};
	} catch (error: any) {
		// Build debug info to include in stderr
		const debugInfo = [
			`[CLI_PATH: ${CLI_PATH}]`,
			`[PROJECT_DIR: ${PROJECT_DIR}]`,
			`[args: ${args.join(' ')}]`,
			`[error.name: ${error.name}]`,
			`[error.message: ${error.message?.slice(0, 200)}]`,
			`[error.signal: ${error.signal}]`,
			`[error.killed: ${error.killed}]`,
		].join(' ');

		return {
			stdout: error.stdout?.toString() || '',
			stderr: `${error.stderr?.toString() || error.message || 'unknown error'} ${debugInfo}`,
			exitCode: error.exitCode || 1,
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
