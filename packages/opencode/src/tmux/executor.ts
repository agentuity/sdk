import type { PaneAction, WindowState, TmuxConfig } from './types';
import { runTmuxCommand, runTmuxCommandSync } from './utils';

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
	error?: string;
}

/**
 * State for separate-window mode - tracks the dedicated "Agents" window
 */
let agentsWindowId: string | undefined;

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
	const result = await runTmuxCommand(['kill-pane', '-t', action.paneId]);
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
	return { success: true, paneId: action.paneId };
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

		// Apply initial layout (useful when more panes are added later)
		if (agentsWindowId && layout) {
			await runTmuxCommand(['select-layout', '-t', agentsWindowId, layout]);
		}

		return { success: true, paneId, windowId };
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

	return {
		success: true,
		paneId: paneId || undefined,
		windowId: agentsWindowId,
	};
}

/**
 * Reset the agents window state (for cleanup)
 */
export function resetAgentsWindow(): void {
	agentsWindowId = undefined;
}

/**
 * Close the agents window if it exists
 * This kills the entire window, which closes all panes within it
 */
export async function closeAgentsWindow(): Promise<void> {
	if (!agentsWindowId) return;

	// Kill the entire window (closes all panes within it)
	await runTmuxCommand(['kill-window', '-t', agentsWindowId]);
	agentsWindowId = undefined;
}

/**
 * Synchronously close the agents window (for shutdown)
 * Uses spawnSync to ensure it completes before process exit
 */
export function closeAgentsWindowSync(): void {
	if (!agentsWindowId) return;

	// Kill the entire window synchronously
	runTmuxCommandSync(['kill-window', '-t', agentsWindowId]);
	agentsWindowId = undefined;
}

/**
 * Get the current agents window ID (for testing/debugging)
 */
export function getAgentsWindowId(): string | undefined {
	return agentsWindowId;
}
