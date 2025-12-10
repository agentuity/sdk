/**
 * CLI Helper
 *
 * Utilities for executing Agentuity CLI commands via subprocess.
 * Uses Bun.$ for subprocess execution with JSON output parsing.
 */

import { $ } from 'bun';
import { resolve } from 'path';

// Resolve CLI binary path relative to this file
// src/test/helpers -> src -> integration-suite -> testing -> apps -> sdk -> packages
const CLI_PATH = resolve(import.meta.dir, '../../../../packages/cli/bin/cli.ts');

export interface CLIResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	json?: any;
}

/**
 * Execute CLI command and return result
 */
export async function runCLI(args: string[]): Promise<CLIResult> {
	try {
		const result = await $`bun ${CLI_PATH} ${args}`.quiet();

		return {
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
			exitCode: result.exitCode,
		};
	} catch (error: any) {
		return {
			stdout: error.stdout?.toString() || '',
			stderr: error.stderr?.toString() || error.message,
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
