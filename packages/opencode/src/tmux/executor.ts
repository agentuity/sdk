import type { PaneAction, WindowState, TmuxConfig } from './types';
import { runTmuxCommand, runTmuxCommandSync } from './utils';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'bun';

/**
 * Path to persist the agents window ID for crash recovery.
 * Uses ~/.config/agentuity/coder/cache/ which is consistent with other Agentuity paths
 * and likely exists for any Agentuity user.
 */
const CACHE_DIR = join(homedir(), '.config', 'agentuity', 'coder', 'cache');
const AGENTS_WINDOW_FILE = join(CACHE_DIR, 'agents-window-id');

/**
 * Escape a string for safe use in shell commands.
 * Wraps in single quotes and escapes any internal single quotes.
 */
function shellEscape(str: string): string {
	// Replace single quotes with '\'' (end quote, escaped quote, start quote)
	return `'${str.replace(/'/g, "'\\''")}'`;
}

/** Maximum retries for recursive spawn attempts to prevent infinite loops */
const MAX_SPAWN_RETRIES = 3;

export interface ActionResult {
	success: boolean;
	paneId?: string;
	windowId?: string;
	pid?: number;
	error?: string;
}

const PROCESS_TERM_WAIT_MS = 1000;

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		return code !== 'ESRCH';
	}
}

async function getPanePid(paneId: string): Promise<number | undefined> {
	if (!paneId) return undefined;
	const result = await runTmuxCommand(['display', '-p', '-t', paneId, '#{pane_pid}']);
	if (!result.success) return undefined;
	const pid = Number(result.output.trim());
	if (!Number.isFinite(pid) || pid <= 0) return undefined;
	return pid;
}

/**
 * Kill a process and all its children (the entire process tree).
 *
 * This is necessary because we spawn `bash -c "opencode attach ...; tmux kill-pane"`
 * and #{pane_pid} returns the bash PID, not the opencode attach PID.
 * We need to kill the children (opencode attach) not just the parent (bash).
 */
export async function killProcessByPid(pid: number): Promise<boolean> {
	if (!Number.isFinite(pid) || pid <= 0) return false;

	// First, kill all child processes
	try {
		const proc = spawn(['pkill', '-TERM', '-P', String(pid)], {
			stdout: 'pipe',
			stderr: 'pipe',
		});
		await proc.exited;
	} catch {
		// Ignore errors - children may not exist
	}

	// Then kill the parent
	try {
		process.kill(pid, 'SIGTERM');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') return true;
		return false;
	}

	await new Promise((resolve) => setTimeout(resolve, PROCESS_TERM_WAIT_MS));

	// Check if parent and children are dead
	if (!isProcessAlive(pid)) return true;

	// Force kill children
	try {
		const proc = spawn(['pkill', '-KILL', '-P', String(pid)], {
			stdout: 'pipe',
			stderr: 'pipe',
		});
		await proc.exited;
	} catch {
		// Ignore errors
	}

	// Force kill parent
	try {
		process.kill(pid, 'SIGKILL');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') return true;
		return false;
	}

	return !isProcessAlive(pid);
}

/**
 * State for separate-window mode - tracks the dedicated "Agents" window
 */
let agentsWindowId: string | undefined;

/**
 * Ensure the cache directory exists
 */
function ensureCacheDir(): void {
	if (!existsSync(CACHE_DIR)) {
		mkdirSync(CACHE_DIR, { recursive: true });
	}
}

/**
 * Persist the agents window ID to disk for crash recovery
 */
function persistAgentsWindowId(windowId: string): void {
	try {
		ensureCacheDir();
		writeFileSync(AGENTS_WINDOW_FILE, windowId, 'utf-8');
	} catch {
		// Ignore write errors - persistence is best-effort
	}
}

/**
 * Load the agents window ID from disk (for crash recovery)
 */
function loadPersistedAgentsWindowId(): string | undefined {
	try {
		if (!existsSync(AGENTS_WINDOW_FILE)) return undefined;
		const windowId = readFileSync(AGENTS_WINDOW_FILE, 'utf-8').trim();
		return windowId || undefined;
	} catch {
		return undefined;
	}
}

/**
 * Clear the persisted agents window ID
 */
function clearPersistedAgentsWindowId(): void {
	try {
		if (existsSync(AGENTS_WINDOW_FILE)) {
			unlinkSync(AGENTS_WINDOW_FILE);
		}
	} catch {
		// Ignore delete errors
	}
}

/**
 * Execute a single pane action
 *
 * All agents spawn in a dedicated "Agents" window with tiled grid layout.
 */
export async function executeAction(
	action: PaneAction,
	ctx: { config: TmuxConfig; serverUrl: string; windowState: WindowState }
): Promise<ActionResult> {
	switch (action.type) {
		case 'spawn':
			return spawnInAgentsWindow(action, { serverUrl: ctx.serverUrl });
		case 'close':
			return closePane(action);
		case 'replace':
			return replacePane(action, ctx);
	}
}

/**
 * Execute multiple actions in sequence
 */
export async function executeActions(
	actions: PaneAction[],
	ctx: { config: TmuxConfig; serverUrl: string; windowState: WindowState }
): Promise<{
	success: boolean;
	spawnedPaneId?: string;
	results: Array<{ action: PaneAction; result: ActionResult }>;
}> {
	const results: Array<{ action: PaneAction; result: ActionResult }> = [];
	let spawnedPaneId: string | undefined;

	for (const action of actions) {
		const result = await executeAction(action, ctx);
		results.push({ action, result });
		if (!result.success) {
			return { success: false, spawnedPaneId, results };
		}
		if (action.type === 'spawn' && result.paneId) {
			spawnedPaneId = result.paneId;
		}
	}

	return { success: true, spawnedPaneId, results };
}

/**
 * Close an existing pane
 * Uses: tmux kill-pane -t <paneId>
 */
async function closePane(action: Extract<PaneAction, { type: 'close' }>): Promise<ActionResult> {
	return closePaneById(action.paneId);
}

/**
 * Close a pane by its ID
 * Exported for use by TmuxSessionManager when sessions complete
 */
export async function closePaneById(paneId: string, pid?: number): Promise<ActionResult> {
	let resolvedPid = pid;
	if (!resolvedPid) {
		resolvedPid = await getPanePid(paneId);
	}

	if (resolvedPid) {
		await killProcessByPid(resolvedPid);
	}

	const result = await runTmuxCommand(['kill-pane', '-t', paneId]);
	if (!result.success) {
		return { success: false, error: result.output };
	}
	return { success: true };
}

/**
 * Replace an existing pane with a new session
 * Pane self-destructs when command exits (session complete, server died, etc.)
 */
async function replacePane(
	action: Extract<PaneAction, { type: 'replace' }>,
	ctx: { serverUrl: string }
): Promise<ActionResult> {
	// Pane kills itself when opencode attach exits (for any reason)
	// Use shellEscape to prevent shell injection via session IDs
	const escapedServerUrl = shellEscape(ctx.serverUrl);
	const escapedSessionId = shellEscape(action.newSessionId);
	const command = `opencode attach ${escapedServerUrl} --session ${escapedSessionId}; tmux kill-pane`;
	const result = await runTmuxCommand(['respawn-pane', '-k', '-t', action.paneId, command]);
	if (!result.success) {
		return { success: false, error: result.output };
	}
	const pid = await getPanePid(action.paneId);
	return { success: true, paneId: action.paneId, pid };
}

/**
 * Spawn agent in a dedicated "Agents" window with tiled grid layout
 *
 * On first spawn: Creates a new window named "Agents"
 * Subsequent spawns: Splits within that window
 * After each spawn: Applies tiled layout for a clean grid
 *
 * This keeps the main pane untouched while grouping all agent panes together.
 * Tip: Click a pane to select it, then press Ctrl-b z to zoom/unzoom.
 *
 * @param retryCount - Internal counter to prevent infinite recursion (default 0)
 */
async function spawnInAgentsWindow(
	action: Extract<PaneAction, { type: 'spawn' }>,
	ctx: { serverUrl: string },
	retryCount = 0
): Promise<ActionResult> {
	// Prevent infinite recursion if tmux keeps failing
	if (retryCount >= MAX_SPAWN_RETRIES) {
		return {
			success: false,
			error: `Failed to spawn agent pane after ${MAX_SPAWN_RETRIES} attempts`,
		};
	}

	// Pane kills itself when opencode attach exits (session complete, server died, etc.)
	// Use shellEscape to prevent shell injection via session IDs
	const escapedServerUrl = shellEscape(ctx.serverUrl);
	const escapedSessionId = shellEscape(action.sessionId);
	const command = `opencode attach ${escapedServerUrl} --session ${escapedSessionId}; tmux kill-pane`;
	const layout = 'tiled'; // Always use tiled layout for grid arrangement

	// Check if we have a cached agents window ID and if it still exists
	if (agentsWindowId) {
		const checkResult = await runTmuxCommand([
			'list-panes',
			'-t',
			agentsWindowId,
			'-F',
			'#{pane_id}',
		]);

		if (!checkResult.success) {
			// Window no longer exists, clear the cache
			agentsWindowId = undefined;
		}
	}

	// If no agents window exists, create one
	if (!agentsWindowId) {
		const createResult = await runTmuxCommand([
			'new-window',
			'-d', // Don't switch to new window
			'-P',
			'-F',
			'#{window_id}:#{pane_id}',
			'-n',
			'Agents',
			command,
		]);

		if (!createResult.success) {
			return { success: false, error: createResult.output };
		}

		// Parse window_id:pane_id from output
		const output = createResult.output?.trim() || '';
		const [windowId, paneId] = output.split(':');
		agentsWindowId = windowId;

		// Persist for crash recovery
		if (agentsWindowId) {
			persistAgentsWindowId(agentsWindowId);
		}

		// Apply initial layout (useful when more panes are added later)
		if (agentsWindowId && layout) {
			await runTmuxCommand(['select-layout', '-t', agentsWindowId, layout]);
		}

		const pid = paneId ? await getPanePid(paneId) : undefined;
		return { success: true, paneId, windowId, pid };
	}

	// Agents window exists - split within it
	// First, get the first pane in the agents window to use as split target
	const listResult = await runTmuxCommand([
		'list-panes',
		'-t',
		agentsWindowId,
		'-F',
		'#{pane_id}',
	]);

	if (!listResult.success || !listResult.output) {
		// Fallback: create new window (with retry counter)
		agentsWindowId = undefined;
		return spawnInAgentsWindow(action, ctx, retryCount + 1);
	}

	const targetPaneId = listResult.output.split('\n')[0]?.trim();
	if (!targetPaneId) {
		// Fallback: create new window (with retry counter)
		agentsWindowId = undefined;
		return spawnInAgentsWindow(action, ctx, retryCount + 1);
	}

	// Split within the agents window
	const splitResult = await runTmuxCommand([
		'split-window',
		action.splitDirection,
		'-t',
		targetPaneId,
		'-P',
		'-F',
		'#{pane_id}',
		command,
	]);

	if (!splitResult.success) {
		return { success: false, error: splitResult.output };
	}

	const paneId = splitResult.output?.trim();

	// Apply the configured layout to the agents window (e.g., tiled for grid)
	if (agentsWindowId && layout) {
		await runTmuxCommand(['select-layout', '-t', agentsWindowId, layout]);
	}

	const pid = paneId ? await getPanePid(paneId) : undefined;
	return {
		success: true,
		paneId: paneId || undefined,
		windowId: agentsWindowId,
		pid,
	};
}

/**
 * Reset the agents window state (for cleanup)
 */
export function resetAgentsWindow(): void {
	agentsWindowId = undefined;
	clearPersistedAgentsWindowId();
}

/**
 * Close the agents window if it exists
 * This kills the entire window, which closes all panes within it
 */
export async function closeAgentsWindow(): Promise<void> {
	// Try to recover window ID from disk if not in memory
	const windowId = agentsWindowId ?? loadPersistedAgentsWindowId();
	if (!windowId) return;

	// Kill the entire window (closes all panes within it)
	await runTmuxCommand(['kill-window', '-t', windowId]);
	agentsWindowId = undefined;
	clearPersistedAgentsWindowId();
}

/**
 * Synchronously close the agents window (for shutdown)
 * Uses spawnSync to ensure it completes before process exit
 */
export function closeAgentsWindowSync(): void {
	// Try to recover window ID from disk if not in memory
	const windowId = agentsWindowId ?? loadPersistedAgentsWindowId();
	if (!windowId) return;

	// Kill the entire window synchronously
	runTmuxCommandSync(['kill-window', '-t', windowId]);
	agentsWindowId = undefined;
	clearPersistedAgentsWindowId();
}

/**
 * Get the current agents window ID (for testing/debugging)
 * Also checks persisted file for crash recovery
 */
export function getAgentsWindowId(): string | undefined {
	return agentsWindowId ?? loadPersistedAgentsWindowId();
}

/**
 * Kill all orphaned opencode attach processes for a given server URL.
 * This is a fallback cleanup method when PID-based cleanup fails.
 *
 * @param serverUrl - The server URL to match (optional, kills all if not provided)
 * @param logger - Optional logging function for debug output
 * @returns Number of processes killed
 */
export async function killOrphanedAttachProcesses(
	serverUrl?: string,
	logger?: (msg: string) => void
): Promise<number> {
	const log = logger ?? (() => {});

	try {
		// Use pkill with pattern matching for opencode attach
		const { spawn } = await import('bun');

		// First, find matching processes to log what we're killing
		const psProc = spawn(['ps', 'aux'], { stdout: 'pipe', stderr: 'pipe' });
		await psProc.exited;
		const psOutput = await new Response(psProc.stdout).text();
		const lines = psOutput.split('\n');

		const matchingPids: number[] = [];
		for (const line of lines) {
			if (!line.includes('opencode attach')) continue;
			if (serverUrl && !line.includes(serverUrl)) continue;
			// Don't kill ourselves
			if (line.includes(String(process.pid))) continue;

			const parts = line.trim().split(/\s+/);
			const pid = Number(parts[1]);
			if (Number.isFinite(pid) && pid > 0) {
				matchingPids.push(pid);
			}
		}

		if (matchingPids.length === 0) {
			log('No orphaned opencode attach processes found');
			return 0;
		}

		log(`Found ${matchingPids.length} orphaned processes: ${matchingPids.join(', ')}`);

		// Kill each process individually for better control
		let killed = 0;
		for (const pid of matchingPids) {
			try {
				// Try SIGTERM first
				process.kill(pid, 'SIGTERM');
				log(`Sent SIGTERM to PID ${pid}`);
				killed++;
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== 'ESRCH') {
					log(`Failed to kill PID ${pid}: ${code}`);
				}
			}
		}

		// Wait a bit then SIGKILL any survivors
		await new Promise((resolve) => setTimeout(resolve, PROCESS_TERM_WAIT_MS));

		for (const pid of matchingPids) {
			if (!isProcessAlive(pid)) continue;
			try {
				process.kill(pid, 'SIGKILL');
				log(`Sent SIGKILL to PID ${pid}`);
			} catch {
				// Ignore errors on SIGKILL
			}
		}

		log(`Cleanup complete: killed ${killed} processes`);
		return killed;
	} catch (error) {
		log(`Fallback cleanup failed: ${error}`);
		return 0;
	}
}

/**
 * Synchronous version of killOrphanedAttachProcesses for shutdown handlers.
 * Uses spawnSync to ensure completion before process exit.
 *
 * @param serverUrl - The server URL to match (optional, kills all if not provided)
 * @param logger - Optional logging function for debug output
 * @returns Number of processes killed
 */
export function killOrphanedAttachProcessesSync(
	serverUrl?: string,
	logger?: (msg: string) => void
): number {
	const log = logger ?? (() => {});

	try {
		// Find matching processes
		const psResult = spawnSync(['ps', 'aux'], { timeout: 2000 });
		if (psResult.exitCode !== 0) {
			log('Failed to list processes');
			return 0;
		}

		const psOutput = psResult.stdout?.toString() ?? '';
		const lines = psOutput.split('\n');

		const matchingPids: number[] = [];
		for (const line of lines) {
			if (!line.includes('opencode attach')) continue;
			if (serverUrl && !line.includes(serverUrl)) continue;
			// Don't kill ourselves
			if (line.includes(String(process.pid))) continue;

			const parts = line.trim().split(/\s+/);
			const pid = Number(parts[1]);
			if (Number.isFinite(pid) && pid > 0) {
				matchingPids.push(pid);
			}
		}

		if (matchingPids.length === 0) {
			log('No orphaned opencode attach processes found');
			return 0;
		}

		log(`Found ${matchingPids.length} orphaned processes: ${matchingPids.join(', ')}`);

		// Kill each process
		let killed = 0;
		for (const pid of matchingPids) {
			try {
				process.kill(pid, 'SIGTERM');
				log(`Sent SIGTERM to PID ${pid}`);
				killed++;
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== 'ESRCH') {
					log(`Failed to kill PID ${pid}: ${code}`);
				}
			}
		}

		// Brief wait using SharedArrayBuffer (sync sleep)
		try {
			const buffer = new SharedArrayBuffer(4);
			const view = new Int32Array(buffer);
			Atomics.wait(view, 0, 0, PROCESS_TERM_WAIT_MS);
		} catch {
			// Ignore sleep errors
		}

		// SIGKILL survivors
		for (const pid of matchingPids) {
			if (!isProcessAlive(pid)) continue;
			try {
				process.kill(pid, 'SIGKILL');
				log(`Sent SIGKILL to PID ${pid}`);
			} catch {
				// Ignore errors
			}
		}

		log(`Cleanup complete: killed ${killed} processes`);
		return killed;
	} catch (error) {
		log(`Fallback cleanup failed: ${error}`);
		return 0;
	}
}
