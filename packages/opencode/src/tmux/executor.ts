import type { PaneAction, WindowState, TmuxConfig } from './types';
import { runTmuxCommand, runTmuxCommandSync } from './utils';
import { spawn, spawnSync } from 'bun';

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

const OPENCODE_TAG = '@agentuity.opencode';
const OPENCODE_SERVER_TAG = '@agentuity.opencode.server';
const OPENCODE_OWNER_TAG = '@agentuity.opencode.ownerPid';
const OPENCODE_INSTANCE_TAG = '@agentuity.opencode.instance';
const OPENCODE_SESSION_TAG = '@agentuity.opencode.session';

type OwnershipContext = {
	instanceId: string;
	ownerPid: number;
	serverKey: string;
	tmuxSessionId?: string;
};

type OwnershipLookup = {
	serverKey: string;
	instanceId: string;
	tmuxSessionId?: string;
};

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

export async function getPanePid(paneId: string): Promise<number | undefined> {
	if (!paneId) return undefined;
	const result = await runTmuxCommand(['display', '-p', '-t', paneId, '#{pane_pid}']);
	if (!result.success) return undefined;
	const pid = Number(result.output.trim());
	if (!Number.isFinite(pid) || pid <= 0) return undefined;
	return pid;
}

export function getPanePidSync(paneId: string): number | undefined {
	if (!paneId) return undefined;
	const result = runTmuxCommandSync(['display', '-p', '-t', paneId, '#{pane_pid}']);
	if (!result.success) return undefined;
	const pid = Number(result.output.trim());
	if (!Number.isFinite(pid) || pid <= 0) return undefined;
	return pid;
}

async function resolvePanePidWithRetry(
	paneId: string,
	maxAttempts = 3,
	delayMs = 75
): Promise<number | undefined> {
	let pid = await getPanePid(paneId);
	if (pid) return pid;
	for (let attempt = 1; attempt < maxAttempts; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		pid = await getPanePid(paneId);
		if (pid) return pid;
	}
	return pid;
}

async function setWindowTags(windowId: string, ownership: OwnershipContext): Promise<void> {
	await runTmuxCommand(['set-option', '-w', '-t', windowId, OPENCODE_TAG, '1']);
	await runTmuxCommand([
		'set-option',
		'-w',
		'-t',
		windowId,
		OPENCODE_SERVER_TAG,
		ownership.serverKey,
	]);
	await runTmuxCommand([
		'set-option',
		'-w',
		'-t',
		windowId,
		OPENCODE_OWNER_TAG,
		String(ownership.ownerPid),
	]);
	await runTmuxCommand([
		'set-option',
		'-w',
		'-t',
		windowId,
		OPENCODE_INSTANCE_TAG,
		ownership.instanceId,
	]);
}

async function setPaneTags(
	paneId: string,
	ownership: OwnershipContext,
	sessionId?: string
): Promise<void> {
	await runTmuxCommand([
		'set-option',
		'-p',
		'-t',
		paneId,
		OPENCODE_INSTANCE_TAG,
		ownership.instanceId,
	]);
	if (sessionId) {
		await runTmuxCommand(['set-option', '-p', '-t', paneId, OPENCODE_SESSION_TAG, sessionId]);
	}
}

async function findOwnedAgentsWindow(
	serverKey: string,
	instanceId: string,
	tmuxSessionId?: string
): Promise<string | undefined> {
	const result = await runTmuxCommand([
		'list-windows',
		'-a',
		'-F',
		`#{window_id}\t#{window_name}\t#{${OPENCODE_TAG}}\t#{${OPENCODE_SERVER_TAG}}\t#{${OPENCODE_INSTANCE_TAG}}\t#{session_id}`,
	]);
	if (!result.success || !result.output) return undefined;

	for (const line of result.output.split('\n')) {
		const [windowId, windowName, isOpencode, windowServerKey, windowInstanceId, sessionId] =
			line.split('\t');
		if (!windowId) continue;
		if (windowName !== 'Agents') continue;
		if (isOpencode !== '1') continue;
		if (windowServerKey !== serverKey) continue;
		if (windowInstanceId !== instanceId) continue;
		// If tmuxSessionId is provided, only match windows in that session
		if (tmuxSessionId && sessionId !== tmuxSessionId) continue;
		return windowId;
	}

	return undefined;
}

function findOwnedAgentsWindowSync(
	serverKey: string,
	instanceId: string,
	tmuxSessionId?: string
): string | undefined {
	const result = runTmuxCommandSync([
		'list-windows',
		'-a',
		'-F',
		`#{window_id}\t#{window_name}\t#{${OPENCODE_TAG}}\t#{${OPENCODE_SERVER_TAG}}\t#{${OPENCODE_INSTANCE_TAG}}\t#{session_id}`,
	]);
	if (!result.success || !result.output) return undefined;

	for (const line of result.output.split('\n')) {
		const [windowId, windowName, isOpencode, windowServerKey, windowInstanceId, sessionId] =
			line.split('\t');
		if (!windowId) continue;
		if (windowName !== 'Agents') continue;
		if (isOpencode !== '1') continue;
		if (windowServerKey !== serverKey) continue;
		if (windowInstanceId !== instanceId) continue;
		// If tmuxSessionId is provided, only match windows in that session
		if (tmuxSessionId && sessionId !== tmuxSessionId) continue;
		return windowId;
	}

	return undefined;
}

export async function findOwnedAgentPanes(
	serverKey: string
): Promise<Array<{ paneId: string; panePid?: number; sessionId?: string; instanceId?: string }>> {
	const windowsResult = await runTmuxCommand([
		'list-windows',
		'-a',
		'-F',
		`#{window_id}\t#{${OPENCODE_SERVER_TAG}}`,
	]);
	if (!windowsResult.success || !windowsResult.output) return [];

	const serverWindowIds = new Set<string>();
	for (const line of windowsResult.output.split('\n')) {
		const [windowId, windowServerKey] = line.split('\t');
		if (!windowId) continue;
		if (windowServerKey !== serverKey) continue;
		serverWindowIds.add(windowId);
	}
	if (serverWindowIds.size === 0) return [];

	const result = await runTmuxCommand([
		'list-panes',
		'-a',
		'-F',
		`#{pane_id}\t#{pane_pid}\t#{window_id}\t#{${OPENCODE_INSTANCE_TAG}}\t#{${OPENCODE_SESSION_TAG}}`,
	]);
	if (!result.success || !result.output) return [];

	const panes: Array<{
		paneId: string;
		panePid?: number;
		sessionId?: string;
		instanceId?: string;
	}> = [];

	for (const line of result.output.split('\n')) {
		const [paneId, panePidRaw, windowId, paneInstanceId, paneSessionId] = line.split('\t');
		if (!paneId) continue;
		if (!windowId || !serverWindowIds.has(windowId)) continue;
		const panePid = Number(panePidRaw);
		panes.push({
			paneId,
			panePid: Number.isFinite(panePid) && panePid > 0 ? panePid : undefined,
			sessionId: paneSessionId || undefined,
			instanceId: paneInstanceId || undefined,
		});
	}

	return panes;
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
 * Keyed by `${serverKey}:${instanceId}:${tmuxSessionId}` to support multiple
 * opencode instances running in different tmux sessions.
 */
const agentsWindowIdByKey = new Map<string, string>();

/**
 * Get the cache key for the agents window
 */
function getAgentsWindowCacheKey(ownership: OwnershipContext): string {
	return `${ownership.serverKey}:${ownership.instanceId}:${ownership.tmuxSessionId ?? 'default'}`;
}

/**
 * Get the cached agents window ID for the given ownership context
 */
function getCachedAgentsWindowId(ownership: OwnershipContext): string | undefined {
	return agentsWindowIdByKey.get(getAgentsWindowCacheKey(ownership));
}

/**
 * Set the cached agents window ID for the given ownership context
 */
function setCachedAgentsWindowId(ownership: OwnershipContext, windowId: string | undefined): void {
	const key = getAgentsWindowCacheKey(ownership);
	if (windowId) {
		agentsWindowIdByKey.set(key, windowId);
	} else {
		agentsWindowIdByKey.delete(key);
	}
}

/**
 * Execute a single pane action
 *
 * All agents spawn in a dedicated "Agents" window with tiled grid layout.
 */
export async function executeAction(
	action: PaneAction,
	ctx: {
		config: TmuxConfig;
		serverUrl: string;
		windowState: WindowState;
		ownership: OwnershipContext;
	}
): Promise<ActionResult> {
	switch (action.type) {
		case 'spawn':
			return spawnInAgentsWindow(action, {
				serverUrl: ctx.serverUrl,
				ownership: ctx.ownership,
			});
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
	ctx: {
		config: TmuxConfig;
		serverUrl: string;
		windowState: WindowState;
		ownership: OwnershipContext;
	}
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
		resolvedPid = await resolvePanePidWithRetry(paneId);
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
	ctx: { serverUrl: string; ownership: OwnershipContext }
): Promise<ActionResult> {
	// Use exec to replace bash with opencode attach directly.
	// This ensures signals go directly to opencode attach (no wrapper process).
	// When opencode attach exits, the pane closes automatically (tmux remain-on-exit off).
	// Use shellEscape to prevent shell injection via session IDs
	const escapedServerUrl = shellEscape(ctx.serverUrl);
	const escapedSessionId = shellEscape(action.newSessionId);
	const command = `exec opencode attach ${escapedServerUrl} --session ${escapedSessionId}`;
	const result = await runTmuxCommand(['respawn-pane', '-k', '-t', action.paneId, command]);
	if (!result.success) {
		return { success: false, error: result.output };
	}
	await setPaneTags(action.paneId, ctx.ownership, action.newSessionId);
	const pid = await resolvePanePidWithRetry(action.paneId);
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
	ctx: { serverUrl: string; ownership: OwnershipContext },
	retryCount = 0
): Promise<ActionResult> {
	// Prevent infinite recursion if tmux keeps failing
	if (retryCount >= MAX_SPAWN_RETRIES) {
		return {
			success: false,
			error: `Failed to spawn agent pane after ${MAX_SPAWN_RETRIES} attempts`,
		};
	}

	// Use exec to replace bash with opencode attach directly.
	// This ensures signals go directly to opencode attach (no wrapper process).
	// When opencode attach exits, the pane closes automatically (tmux remain-on-exit off).
	// Use shellEscape to prevent shell injection via session IDs
	const escapedServerUrl = shellEscape(ctx.serverUrl);
	const escapedSessionId = shellEscape(action.sessionId);
	const command = `exec opencode attach ${escapedServerUrl} --session ${escapedSessionId}`;
	const layout = 'tiled'; // Always use tiled layout for grid arrangement

	// Check if we have a cached agents window ID and if it still exists
	let cachedWindowId = getCachedAgentsWindowId(ctx.ownership);
	if (cachedWindowId) {
		const checkResult = await runTmuxCommand([
			'display',
			'-p',
			'-t',
			cachedWindowId,
			`#{${OPENCODE_TAG}}\t#{${OPENCODE_SERVER_TAG}}\t#{${OPENCODE_INSTANCE_TAG}}`,
		]);

		if (!checkResult.success || !checkResult.output) {
			setCachedAgentsWindowId(ctx.ownership, undefined);
			cachedWindowId = undefined;
		} else {
			const [isOpencode, windowServerKey, windowInstanceId] = checkResult.output
				.trim()
				.split('\t');
			if (
				isOpencode !== '1' ||
				windowServerKey !== ctx.ownership.serverKey ||
				windowInstanceId !== ctx.ownership.instanceId
			) {
				setCachedAgentsWindowId(ctx.ownership, undefined);
				cachedWindowId = undefined;
			}
		}
	}

	if (!cachedWindowId) {
		cachedWindowId = await findOwnedAgentsWindow(
			ctx.ownership.serverKey,
			ctx.ownership.instanceId,
			ctx.ownership.tmuxSessionId
		);
		if (cachedWindowId) {
			setCachedAgentsWindowId(ctx.ownership, cachedWindowId);
		}
	}

	// If no agents window exists, create one
	if (!cachedWindowId) {
		// Build the new-window command args
		// CRITICAL: Use -t <session>: to target the correct tmux session
		// Without this, tmux may create the window in the wrong session when
		// multiple opencode instances run in different tmux sessions
		const newWindowArgs = ['new-window'];
		if (ctx.ownership.tmuxSessionId) {
			// Target the specific tmux session (the colon after session_id is important)
			newWindowArgs.push('-t', `${ctx.ownership.tmuxSessionId}:`);
		}
		newWindowArgs.push(
			'-d', // Don't switch to new window
			'-P',
			'-F',
			'#{window_id}:#{pane_id}',
			'-n',
			'Agents',
			command
		);

		const createResult = await runTmuxCommand(newWindowArgs);

		if (!createResult.success) {
			return { success: false, error: createResult.output };
		}

		// Parse window_id:pane_id from output
		const output = createResult.output?.trim() || '';
		const [windowId, paneId] = output.split(':');
		cachedWindowId = windowId;

		if (cachedWindowId) {
			setCachedAgentsWindowId(ctx.ownership, cachedWindowId);
			await setWindowTags(cachedWindowId, ctx.ownership);
		}

		// Apply initial layout (useful when more panes are added later)
		if (cachedWindowId && layout) {
			await runTmuxCommand(['select-layout', '-t', cachedWindowId, layout]);
		}

		if (paneId) {
			await setPaneTags(paneId, ctx.ownership, action.sessionId);
		}

		const pid = paneId ? await resolvePanePidWithRetry(paneId) : undefined;
		return { success: true, paneId, windowId, pid };
	}

	// Agents window exists - split within it
	// First, get the first pane in the agents window to use as split target
	const listResult = await runTmuxCommand([
		'list-panes',
		'-t',
		cachedWindowId,
		'-F',
		'#{pane_id}',
	]);

	if (!listResult.success || !listResult.output) {
		// Fallback: create new window (with retry counter)
		setCachedAgentsWindowId(ctx.ownership, undefined);
		return spawnInAgentsWindow(action, ctx, retryCount + 1);
	}

	const targetPaneId = listResult.output.split('\n')[0]?.trim();
	if (!targetPaneId) {
		// Fallback: create new window (with retry counter)
		setCachedAgentsWindowId(ctx.ownership, undefined);
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
	if (cachedWindowId) {
		await setWindowTags(cachedWindowId, ctx.ownership);
	}
	if (paneId) {
		await setPaneTags(paneId, ctx.ownership, action.sessionId);
	}

	// Apply the configured layout to the agents window (e.g., tiled for grid)
	if (cachedWindowId && layout) {
		await runTmuxCommand(['select-layout', '-t', cachedWindowId, layout]);
	}

	const pid = paneId ? await resolvePanePidWithRetry(paneId) : undefined;
	return {
		success: true,
		paneId: paneId || undefined,
		windowId: cachedWindowId,
		pid,
	};
}

function killProcessByPidSync(pid: number): void {
	if (!Number.isFinite(pid) || pid <= 0) return;

	try {
		spawnSync(['pkill', '-TERM', '-P', String(pid)]);
	} catch {
		// Ignore errors - children may not exist
	}

	try {
		process.kill(pid, 'SIGTERM');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') return;
	}

	try {
		const buffer = new SharedArrayBuffer(4);
		const view = new Int32Array(buffer);
		Atomics.wait(view, 0, 0, PROCESS_TERM_WAIT_MS);
	} catch {
		// ignore sleep errors
	}

	try {
		process.kill(pid, 0);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') return;
	}

	try {
		spawnSync(['pkill', '-KILL', '-P', String(pid)]);
	} catch {
		// Ignore errors
	}

	try {
		process.kill(pid, 'SIGKILL');
	} catch {
		// ignore errors
	}
}

/**
 * Reset the agents window state (for cleanup)
 */
export function resetAgentsWindow(ownership?: OwnershipContext): void {
	if (ownership) {
		setCachedAgentsWindowId(ownership, undefined);
	} else {
		agentsWindowIdByKey.clear();
	}
}

/**
 * Close the agents window if it exists
 * This kills the entire window, which closes all panes within it
 *
 * SAFETY: Verifies the window is named "Agents" before killing to prevent
 * accidentally killing user windows if the cached ID is stale.
 */
export async function closeAgentsWindow(ownership?: OwnershipLookup): Promise<void> {
	// Build a pseudo-ownership context for cache lookup
	const cacheKey = ownership
		? {
				serverKey: ownership.serverKey,
				instanceId: ownership.instanceId,
				ownerPid: 0,
				tmuxSessionId: ownership.tmuxSessionId,
			}
		: undefined;
	const cachedId = cacheKey ? getCachedAgentsWindowId(cacheKey) : undefined;
	const windowId =
		cachedId ??
		(ownership
			? await findOwnedAgentsWindow(
					ownership.serverKey,
					ownership.instanceId,
					ownership.tmuxSessionId
				)
			: undefined);
	if (!windowId) return;

	const checkFormat = ownership
		? `#{window_name}\t#{${OPENCODE_TAG}}\t#{${OPENCODE_SERVER_TAG}}\t#{${OPENCODE_INSTANCE_TAG}}`
		: '#{window_name}';
	const checkResult = await runTmuxCommand(['display', '-p', '-t', windowId, checkFormat]);

	if (!checkResult.success) {
		if (cacheKey) setCachedAgentsWindowId(cacheKey, undefined);
		return;
	}

	const parts = checkResult.output?.trim().split('\t') ?? [];
	const windowName = parts[0];
	if (windowName !== 'Agents') {
		if (cacheKey) setCachedAgentsWindowId(cacheKey, undefined);
		return;
	}
	if (ownership) {
		const [, isOpencode, windowServerKey, windowInstanceId] = parts;
		if (
			isOpencode !== '1' ||
			windowServerKey !== ownership.serverKey ||
			windowInstanceId !== ownership.instanceId
		) {
			if (cacheKey) setCachedAgentsWindowId(cacheKey, undefined);
			return;
		}
	}

	await runTmuxCommand(['kill-window', '-t', windowId]);
	if (cacheKey) setCachedAgentsWindowId(cacheKey, undefined);
}

/**
 * Synchronously close the agents window (for shutdown)
 * Uses runTmuxCommandSync to ensure it completes before process exit
 *
 * SAFETY: Verifies the window is named "Agents" before killing to prevent
 * accidentally killing user windows if the cached ID is stale.
 */
export function closeAgentsWindowSync(ownership?: OwnershipLookup): void {
	// Build a pseudo-ownership context for cache lookup
	const cacheKey = ownership
		? {
				serverKey: ownership.serverKey,
				instanceId: ownership.instanceId,
				ownerPid: 0,
				tmuxSessionId: ownership.tmuxSessionId,
			}
		: undefined;
	const cachedId = cacheKey ? getCachedAgentsWindowId(cacheKey) : undefined;
	const windowId =
		cachedId ??
		(ownership
			? findOwnedAgentsWindowSync(
					ownership.serverKey,
					ownership.instanceId,
					ownership.tmuxSessionId
				)
			: undefined);
	if (!windowId) return;

	const checkFormat = ownership
		? `#{window_name}\t#{${OPENCODE_TAG}}\t#{${OPENCODE_SERVER_TAG}}\t#{${OPENCODE_INSTANCE_TAG}}`
		: '#{window_name}';
	const checkResult = runTmuxCommandSync(['display', '-p', '-t', windowId, checkFormat]);

	if (!checkResult.success) {
		if (cacheKey) setCachedAgentsWindowId(cacheKey, undefined);
		return;
	}

	const parts = checkResult.output?.trim().split('\t') ?? [];
	const windowName = parts[0];
	if (windowName !== 'Agents') {
		if (cacheKey) setCachedAgentsWindowId(cacheKey, undefined);
		return;
	}
	if (ownership) {
		const [, isOpencode, windowServerKey, windowInstanceId] = parts;
		if (
			isOpencode !== '1' ||
			windowServerKey !== ownership.serverKey ||
			windowInstanceId !== ownership.instanceId
		) {
			if (cacheKey) setCachedAgentsWindowId(cacheKey, undefined);
			return;
		}
	}

	runTmuxCommandSync(['kill-window', '-t', windowId]);
	if (cacheKey) setCachedAgentsWindowId(cacheKey, undefined);
}

/**
 * Get the current agents window ID (for testing/debugging)
 */
export function getAgentsWindowId(ownership?: OwnershipContext): string | undefined {
	if (ownership) {
		return getCachedAgentsWindowId(ownership);
	}
	// Return first cached window ID (for backwards compatibility in tests)
	const values = agentsWindowIdByKey.values();
	const first = values.next();
	return first.done ? undefined : first.value;
}

/**
 * Clean up owned tmux windows/panes using ownership tags.
 */
export async function cleanupOwnedResources(
	serverKey: string,
	instanceId: string
): Promise<{ panesClosed: number; windowClosed: boolean }> {
	if (!instanceId) return { panesClosed: 0, windowClosed: false };

	const windowsResult = await runTmuxCommand([
		'list-windows',
		'-a',
		'-F',
		`#{window_id}\t#{window_name}\t#{${OPENCODE_TAG}}\t#{${OPENCODE_SERVER_TAG}}\t#{${OPENCODE_INSTANCE_TAG}}`,
	]);
	const windowsToClose = new Set<string>();
	const serverWindowIds = new Set<string>();

	if (windowsResult.success && windowsResult.output) {
		for (const line of windowsResult.output.split('\n')) {
			const [windowId, windowName, isOpencode, windowServerKey, windowInstanceId] =
				line.split('\t');
			if (!windowId) continue;
			if (windowServerKey === serverKey) {
				serverWindowIds.add(windowId);
			}
			if (windowName !== 'Agents') continue;
			if (isOpencode !== '1') continue;
			if (windowServerKey !== serverKey) continue;
			if (windowInstanceId !== instanceId) continue;
			windowsToClose.add(windowId);
		}
	}

	const panesResult = await runTmuxCommand([
		'list-panes',
		'-a',
		'-F',
		`#{pane_id}\t#{pane_pid}\t#{window_id}\t#{${OPENCODE_INSTANCE_TAG}}`,
	]);

	const panesToClose: Array<{ paneId: string; panePid?: number; windowId: string }> = [];
	if (panesResult.success && panesResult.output) {
		for (const line of panesResult.output.split('\n')) {
			const [paneId, panePidRaw, windowId, paneInstanceId] = line.split('\t');
			if (!paneId) continue;
			if (!windowId || !serverWindowIds.has(windowId)) continue;
			if (paneInstanceId !== instanceId) continue;
			const panePid = Number(panePidRaw);
			panesToClose.push({
				paneId,
				panePid: Number.isFinite(panePid) && panePid > 0 ? panePid : undefined,
				windowId,
			});
		}
	}

	for (const pane of panesToClose) {
		if (pane.panePid) {
			await killProcessByPid(pane.panePid);
		}
	}

	let windowClosed = false;
	for (const windowId of windowsToClose) {
		await runTmuxCommand(['kill-window', '-t', windowId]);
		windowClosed = true;
	}

	let panesClosed = 0;
	for (const pane of panesToClose) {
		if (windowsToClose.has(pane.windowId)) continue;
		await runTmuxCommand(['kill-pane', '-t', pane.paneId]);
		panesClosed += 1;
	}

	return { panesClosed, windowClosed };
}

/**
 * Synchronous cleanup for owned tmux windows/panes.
 */
export function cleanupOwnedResourcesSync(
	serverKey: string,
	instanceId: string
): { panesClosed: number; windowClosed: boolean } {
	if (!instanceId) return { panesClosed: 0, windowClosed: false };

	const windowsResult = runTmuxCommandSync([
		'list-windows',
		'-a',
		'-F',
		`#{window_id}\t#{window_name}\t#{${OPENCODE_TAG}}\t#{${OPENCODE_SERVER_TAG}}\t#{${OPENCODE_INSTANCE_TAG}}`,
	]);
	const windowsToClose = new Set<string>();
	const serverWindowIds = new Set<string>();

	if (windowsResult.success && windowsResult.output) {
		for (const line of windowsResult.output.split('\n')) {
			const [windowId, windowName, isOpencode, windowServerKey, windowInstanceId] =
				line.split('\t');
			if (!windowId) continue;
			if (windowServerKey === serverKey) {
				serverWindowIds.add(windowId);
			}
			if (windowName !== 'Agents') continue;
			if (isOpencode !== '1') continue;
			if (windowServerKey !== serverKey) continue;
			if (windowInstanceId !== instanceId) continue;
			windowsToClose.add(windowId);
		}
	}

	const panesResult = runTmuxCommandSync([
		'list-panes',
		'-a',
		'-F',
		`#{pane_id}\t#{pane_pid}\t#{window_id}\t#{${OPENCODE_INSTANCE_TAG}}`,
	]);
	const panesToClose: Array<{ paneId: string; panePid?: number; windowId: string }> = [];

	if (panesResult.success && panesResult.output) {
		for (const line of panesResult.output.split('\n')) {
			const [paneId, panePidRaw, windowId, paneInstanceId] = line.split('\t');
			if (!paneId) continue;
			if (!windowId || !serverWindowIds.has(windowId)) continue;
			if (paneInstanceId !== instanceId) continue;
			const panePid = Number(panePidRaw);
			panesToClose.push({
				paneId,
				panePid: Number.isFinite(panePid) && panePid > 0 ? panePid : undefined,
				windowId,
			});
		}
	}

	for (const pane of panesToClose) {
		if (pane.panePid) {
			killProcessByPidSync(pane.panePid);
		}
	}

	let windowClosed = false;
	for (const windowId of windowsToClose) {
		runTmuxCommandSync(['kill-window', '-t', windowId]);
		windowClosed = true;
	}

	let panesClosed = 0;
	for (const pane of panesToClose) {
		if (windowsToClose.has(pane.windowId)) continue;
		runTmuxCommandSync(['kill-pane', '-t', pane.paneId]);
		panesClosed += 1;
	}

	return { panesClosed, windowClosed };
}
