import { spawn, spawnSync } from 'bun';

/**
 * Check if running inside a tmux session
 */
export function isInsideTmux(): boolean {
	return !!process.env.TMUX;
}

/**
 * Get the current pane ID
 */
export function getCurrentPaneId(): string | undefined {
	return process.env.TMUX_PANE;
}

/**
 * Get the path to the tmux binary
 */
export async function getTmuxPath(): Promise<string | null> {
	try {
		const proc = spawn(['which', 'tmux'], { stdout: 'pipe' });
		await proc.exited;
		const output = await new Response(proc.stdout).text();
		return output.trim() || null;
	} catch {
		return null;
	}
}

/**
 * Run a tmux command and return output
 */
export async function runTmuxCommand(
	args: string[]
): Promise<{ success: boolean; output: string }> {
	const tmux = await getTmuxPath();
	if (!tmux) return { success: false, output: 'tmux not found' };

	const proc = spawn([tmux, ...args], { stdout: 'pipe', stderr: 'pipe' });
	const exitCode = await proc.exited;
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();

	return {
		success: exitCode === 0,
		output: exitCode === 0 ? stdout.trim() : stderr.trim(),
	};
}

/**
 * Run a tmux command synchronously (for shutdown scenarios)
 * Uses spawnSync to ensure completion before process exit
 */
export function runTmuxCommandSync(args: string[]): { success: boolean; output: string } {
	const tmux = getTmuxPathSync();
	if (!tmux) return { success: false, output: 'tmux not found' };

	try {
		const result = spawnSync([tmux, ...args], { timeout: 2000 });
		const stdout = result.stdout?.toString() ?? '';
		const stderr = result.stderr?.toString() ?? '';

		return {
			success: result.exitCode === 0,
			output: result.exitCode === 0 ? stdout.trim() : stderr.trim(),
		};
	} catch {
		return { success: false, output: 'tmux command failed' };
	}
}

/**
 * Get the path to the tmux binary synchronously
 */
export function getTmuxPathSync(): string | null {
	try {
		const result = spawnSync(['which', 'tmux']);
		if (result.exitCode !== 0) return null;
		const output = result.stdout?.toString() ?? '';
		return output.trim() || null;
	} catch {
		return null;
	}
}

/**
 * Get the tmux session ID for a given pane.
 * This is used to ensure windows are created in the correct tmux session
 * when multiple opencode instances run in different sessions.
 */
export async function getTmuxSessionId(paneId: string): Promise<string | undefined> {
	const result = await runTmuxCommand(['display', '-p', '-t', paneId, '#{session_id}']);
	if (!result.success || !result.output) return undefined;
	return result.output.trim() || undefined;
}

/**
 * Get the tmux session ID synchronously (for shutdown scenarios)
 */
export function getTmuxSessionIdSync(paneId: string): string | undefined {
	const result = runTmuxCommandSync(['display', '-p', '-t', paneId, '#{session_id}']);
	if (!result.success || !result.output) return undefined;
	return result.output.trim() || undefined;
}

/**
 * Canonicalize server URL for consistent ownership tagging.
 * Normalizes loopback addresses (127.0.0.1, ::1) to localhost.
 *
 * @throws Error if URL is invalid
 */
export function canonicalizeServerUrl(url: string): string {
	try {
		const parsed = new URL(url);
		let host = parsed.hostname.toLowerCase();
		if (host === '127.0.0.1' || host === '::1') {
			host = 'localhost';
		}
		return `${parsed.protocol}//${host}:${parsed.port}`;
	} catch (error) {
		throw new Error(`Invalid server URL: ${url}`, { cause: error });
	}
}
