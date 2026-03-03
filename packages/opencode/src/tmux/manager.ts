import type { PluginInput } from '@opencode-ai/plugin';
import { spawnSync } from 'bun';
import { randomUUID } from 'node:crypto';
import type {
	PaneAction,
	TmuxConfig,
	TmuxPaneInfo,
	TrackedSession,
	WindowState,
	SessionMapping,
} from './types.ts';
import { POLL_INTERVAL_MS, SESSION_MISSING_GRACE_MS, SESSION_TIMEOUT_MS } from './types.ts';
import {
	canonicalizeServerUrl,
	getCurrentPaneId,
	getTmuxPath,
	getTmuxSessionId,
	isInsideTmux,
} from './utils.ts';
import { queryWindowState } from './state-query.ts';
import { decideSpawnActions } from './decision-engine.ts';
import {
	executeActions,
	closeAgentsWindow,
	closeAgentsWindowSync,
	closePaneById,
	killProcessByPid,
	getPanePid,
	getPanePidSync,
	cleanupOwnedResources,
	cleanupOwnedResourcesSync,
	findOwnedAgentPanes,
} from './executor.ts';

/**
 * Check if the OpenCode server is running by hitting the health endpoint
 */
async function isServerRunning(serverUrl: string): Promise<boolean> {
	try {
		const healthUrl = new URL('/health', serverUrl).toString();
		const response = await fetch(healthUrl, {
			signal: AbortSignal.timeout(2000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

export interface TmuxSessionManagerCallbacks {
	onLog?: (message: string) => void;
}

/**
 * Manages tmux panes for agent sessions.
 *
 * Architecture:
 * 1. QUERY: Get actual tmux pane state (source of truth)
 * 2. DECIDE: Pure function determines actions based on state
 * 3. EXECUTE: Execute actions with verification
 * 4. UPDATE: Update internal cache only after tmux confirms success
 */
export class TmuxSessionManager {
	private sessions = new Map<string, TrackedSession>();
	private pendingSessions = new Set<string>();
	private pollInterval?: ReturnType<typeof setInterval>;
	private sourcePaneId: string | undefined;
	private tmuxSessionId: string | undefined;
	private instanceId = randomUUID().slice(0, 8);
	private ownerPid = process.pid;
	private serverKey: string | undefined;
	private statusMissingSince = new Map<string, number>();
	/**
	 * Operation queue to serialize tmux mutations.
	 * This prevents race conditions when multiple sessions are created rapidly.
	 */
	private tmuxOpQueue: Promise<void> = Promise.resolve();

	constructor(
		private ctx: PluginInput,
		private config: TmuxConfig,
		private callbacks?: TmuxSessionManagerCallbacks
	) {
		this.sourcePaneId = getCurrentPaneId();
	}

	/**
	 * Enqueue a tmux operation to ensure sequential execution.
	 * This prevents race conditions when multiple sessions are created/deleted rapidly.
	 */
	private enqueue<T>(fn: () => Promise<T>): Promise<T> {
		const result = this.tmuxOpQueue.then(fn, fn); // Run even if previous failed
		// Update queue but don't propagate errors to next operation
		this.tmuxOpQueue = result.then(
			() => {},
			() => {}
		);
		return result;
	}

	/**
	 * Check if tmux integration is enabled and available
	 */
	isEnabled(): boolean {
		return this.config.enabled && isInsideTmux();
	}

	/**
	 * Handle a new subagent session being created
	 * This is called when a delegated session starts
	 *
	 * Operations are queued to prevent race conditions when multiple sessions
	 * are created rapidly.
	 */
	async onSessionCreated(event: {
		sessionId: string;
		parentId: string;
		title: string;
	}): Promise<void> {
		return this.enqueue(() => this.doSessionCreated(event));
	}

	/**
	 * Internal implementation of session creation (runs within the queue)
	 */
	private async doSessionCreated(event: {
		sessionId: string;
		parentId: string;
		title: string;
	}): Promise<void> {
		this.log(`onSessionCreated called for ${event.sessionId} (${event.title})`);

		if (!this.isEnabled()) {
			this.log(
				`Skipping - tmux not enabled (config: ${this.config.enabled}, insideTmux: ${isInsideTmux()})`
			);
			return;
		}
		if (this.pendingSessions.has(event.sessionId) || this.sessions.has(event.sessionId)) {
			this.log(`Skipping - session ${event.sessionId} already pending or tracked`);
			return;
		}
		this.pendingSessions.add(event.sessionId);

		try {
			const tmuxPath = await getTmuxPath();
			if (!tmuxPath) {
				this.log('tmux binary not found.');
				return;
			}

			if (!this.sourcePaneId) {
				this.sourcePaneId = getCurrentPaneId();
			}

			if (!this.sourcePaneId) {
				this.log('Unable to determine source pane id.');
				return;
			}

			// Get the tmux session ID for this pane (cached after first lookup)
			if (!this.tmuxSessionId) {
				this.tmuxSessionId = await getTmuxSessionId(this.sourcePaneId);
				if (this.tmuxSessionId) {
					this.log(`Resolved tmux session ID: ${this.tmuxSessionId}`);
				}
			}

			const state = await queryWindowState(this.sourcePaneId);
			if (!state) {
				this.log('Failed to query tmux window state.');
				return;
			}

			const decision = decideSpawnActions(
				state,
				event.sessionId,
				event.title,
				{
					mainPaneMinWidth: this.config.mainPaneMinWidth,
					agentPaneMinWidth: this.config.agentPaneMinWidth,
					maxPanes: this.config.maxPanes,
				},
				this.getSessionMappings()
			);

			if (!decision.canSpawn) {
				if (decision.reason) {
					this.log(`Cannot spawn pane: ${decision.reason}`);
				}
				return;
			}

			const serverUrl = this.getServerUrl();
			if (!serverUrl) {
				this.log('Unable to determine OpenCode server URL.');
				return;
			}

			// Check if server is actually running before attempting to spawn
			const serverRunning = await isServerRunning(serverUrl);
			if (!serverRunning) {
				this.log(
					`Server not running at ${serverUrl}. Start opencode with --port flag to enable tmux integration.`
				);
				return;
			}

			const serverKey = canonicalizeServerUrl(serverUrl);
			this.serverKey = serverKey;

			const result = await executeActions(decision.actions, {
				config: this.config,
				serverUrl,
				windowState: state,
				ownership: {
					instanceId: this.instanceId,
					ownerPid: this.ownerPid,
					serverKey,
					tmuxSessionId: this.tmuxSessionId,
				},
			});

			if (!result.success) {
				this.log('Failed to execute tmux actions.');
				return;
			}

			this.applyActionResults(decision.actions, result.results);
			await this.refreshMissingPids();
			this.log(
				`Successfully spawned pane for ${event.sessionId}. Tracking ${this.sessions.size} sessions. PIDs: ${this.getTrackedPids().join(', ') || 'none'}`
			);
			if (this.sessions.size > 0) {
				this.startPolling();
			}
		} finally {
			this.pendingSessions.delete(event.sessionId);
		}
	}

	/**
	 * Get all tracked PIDs for logging
	 */
	private getTrackedPids(): number[] {
		return Array.from(this.sessions.values())
			.map((s) => s.pid)
			.filter((pid): pid is number => pid !== undefined);
	}

	/**
	 * Handle a session being deleted
	 *
	 * Explicitly kills the pane when a subagent session completes.
	 * We can't rely on `opencode attach` exiting because it's an interactive
	 * terminal that keeps running even after the session goes idle.
	 *
	 * Operations are queued to prevent race conditions.
	 */
	async onSessionDeleted(event: { sessionId: string }): Promise<void> {
		return this.enqueue(() => this.doSessionDeleted(event));
	}

	/**
	 * Internal implementation of session deletion (runs within the queue)
	 */
	private async doSessionDeleted(event: { sessionId: string }): Promise<void> {
		this.log(`onSessionDeleted called for ${event.sessionId}`);

		if (!this.isEnabled()) {
			this.log(`Skipping delete - tmux not enabled`);
			return;
		}

		// Find the session in our mappings
		const session = this.sessions.get(event.sessionId);
		if (!session) {
			this.log(`Session ${event.sessionId} not found in tracked sessions`);
			return;
		}

		this.log(
			`Closing pane ${session.paneId} (PID: ${session.pid}) for session ${event.sessionId}`
		);

		// Kill the pane explicitly - opencode attach won't exit on its own
		const result = await closePaneById(session.paneId, session.pid);
		if (!result.success) {
			this.log(`Failed to close pane ${session.paneId}: ${result.error}`);
		} else {
			this.log(`Successfully closed pane ${session.paneId}`);
		}

		// Update internal state
		this.sessions.delete(event.sessionId);
		this.statusMissingSince.delete(event.sessionId);
		this.log(`Removed session from tracking. Now tracking ${this.sessions.size} sessions.`);

		if (this.sessions.size === 0) {
			this.stopPolling();
		}
	}

	/**
	 * Clean up all panes on shutdown
	 *
	 * Kills the entire "Agents" window, which closes all agent panes at once.
	 * Falls back to pkill if PID-based cleanup fails.
	 */
	async cleanup(): Promise<void> {
		this.log('Starting cleanup...');
		this.stopPolling();

		for (const session of this.sessions.values()) {
			let pid = session.pid;
			if (!pid) {
				pid = await getPanePid(session.paneId);
				if (pid) {
					session.pid = pid;
				}
			}
			if (!pid) continue;
			this.log(`Killing process ${pid} for session ${session.sessionId}`);
			const success = await killProcessByPid(pid);
			if (!success) {
				this.log(`Failed to kill process ${pid} for session ${session.sessionId}`);
			}
		}

		const serverKey = this.getServerKey();
		if (serverKey) {
			await cleanupOwnedResources(serverKey, this.instanceId);
		} else {
			await closeAgentsWindow();
		}
		this.sessions.clear();
		this.statusMissingSince.clear();

		this.log('Cleanup complete');
	}

	/**
	 * Synchronous cleanup for shutdown (ensures completion before exit)
	 *
	 * Uses spawnSync to guarantee the tmux commands complete before the
	 * process exits, which is necessary for signal handlers.
	 */
	cleanupSync(): void {
		this.log('Starting sync cleanup...');
		this.stopPolling();

		for (const session of this.sessions.values()) {
			let pid = session.pid;
			if (!pid) {
				pid = getPanePidSync(session.paneId);
				if (pid) {
					session.pid = pid;
				}
			}
			if (!pid) continue;
			this.log(`Killing process ${pid} for session ${session.sessionId}`);
			this.killProcessByPidSync(pid);
		}

		const serverKey = this.getServerKey();
		if (serverKey) {
			cleanupOwnedResourcesSync(serverKey, this.instanceId);
		} else {
			closeAgentsWindowSync();
		}
		this.sessions.clear();
		this.statusMissingSince.clear();

		this.log('Sync cleanup complete');
	}

	/**
	 * Start polling for session status
	 */
	private startPolling(): void {
		if (this.pollInterval) return;
		this.pollInterval = setInterval(() => {
			void this.pollSessions();
		}, POLL_INTERVAL_MS);
	}

	/**
	 * Stop polling
	 */
	private stopPolling(): void {
		if (!this.pollInterval) return;
		clearInterval(this.pollInterval);
		this.pollInterval = undefined;
	}

	/**
	 * Poll active sessions for status changes
	 */
	private async pollSessions(): Promise<void> {
		return this.enqueue(() => this.doPollSessions());
	}

	/**
	 * Poll active sessions for status changes
	 */
	private async doPollSessions(): Promise<void> {
		if (!this.isEnabled()) return;
		if (!this.sourcePaneId) return;

		const state = await queryWindowState(this.sourcePaneId);
		if (!state) return;
		const statusMap = await this.fetchSessionStatuses();

		const now = Date.now();
		const sessionsToClose: TrackedSession[] = [];
		for (const session of this.sessions.values()) {
			const pane = findPane(state, session.paneId);
			if (pane) {
				session.lastSeenAt = new Date();
				if (!session.pid) {
					const pid = await getPanePid(session.paneId);
					if (pid) {
						session.pid = pid;
					}
				}
			} else {
				const missingFor = now - session.lastSeenAt.getTime();
				if (missingFor > SESSION_MISSING_GRACE_MS) {
					if (session.pid) {
						await killProcessByPid(session.pid);
					}
					this.sessions.delete(session.sessionId);
					this.statusMissingSince.delete(session.sessionId);
					continue;
				}
			}

			const status = statusMap[session.sessionId];
			if (status) {
				this.statusMissingSince.delete(session.sessionId);
			} else if (!this.statusMissingSince.has(session.sessionId)) {
				this.statusMissingSince.set(session.sessionId, now);
			}

			const statusMissingAt = this.statusMissingSince.get(session.sessionId);
			const missingTooLong =
				statusMissingAt !== undefined && now - statusMissingAt > SESSION_MISSING_GRACE_MS;
			const age = now - session.createdAt.getTime();
			const isTimedOut = age > SESSION_TIMEOUT_MS;
			const isIdle = status?.type === 'idle';

			if (isIdle || missingTooLong || isTimedOut) {
				sessionsToClose.push(session);
			}
		}

		for (const session of sessionsToClose) {
			this.log(`Closing idle session ${session.sessionId} (pane: ${session.paneId})`);
			const result = await closePaneById(session.paneId, session.pid);
			if (!result.success) {
				this.log(
					`Failed to close pane ${session.paneId} for session ${session.sessionId}: ${result.error}`
				);
			}
			this.sessions.delete(session.sessionId);
			this.statusMissingSince.delete(session.sessionId);
		}

		if (this.sessions.size === 0) {
			this.stopPolling();
		}
	}

	/**
	 * Get session mappings for decision engine
	 */
	private getSessionMappings(): SessionMapping[] {
		return Array.from(this.sessions.values()).map((session) => ({
			sessionId: session.sessionId,
			paneId: session.paneId,
			createdAt: session.createdAt,
		}));
	}

	private getServerUrl(): string | undefined {
		const ctx = this.ctx as unknown as {
			serverUrl?: string | URL;
			baseUrl?: string | URL;
			client?: { baseUrl?: string | URL };
		};
		const serverUrl = ctx.serverUrl ?? ctx.baseUrl ?? ctx.client?.baseUrl;
		if (!serverUrl) return undefined;
		return typeof serverUrl === 'string' ? serverUrl : serverUrl.toString();
	}

	private getServerKey(): string | undefined {
		if (this.serverKey) return this.serverKey;
		const serverUrl = this.getServerUrl();
		if (!serverUrl) return undefined;
		try {
			const serverKey = canonicalizeServerUrl(serverUrl);
			this.serverKey = serverKey;
			return serverKey;
		} catch (error) {
			this.log(`Failed to canonicalize server URL "${serverUrl}": ${error}`);
			return undefined;
		}
	}

	private applyActionResults(
		actions: PaneAction[],
		results: Array<{ action: PaneAction; result: { paneId?: string; pid?: number } }>
	): void {
		const now = new Date();
		for (const [index, action] of actions.entries()) {
			const actionResult = results[index]?.result;
			switch (action.type) {
				case 'close':
					this.sessions.delete(action.sessionId);
					break;
				case 'replace':
					this.sessions.delete(action.oldSessionId);
					this.statusMissingSince.delete(action.oldSessionId);
					this.sessions.set(action.newSessionId, {
						sessionId: action.newSessionId,
						paneId: action.paneId,
						pid: actionResult?.pid,
						description: action.description,
						createdAt: now,
						lastSeenAt: now,
					});
					break;
				case 'spawn': {
					const paneId = actionResult?.paneId;
					if (!paneId) break;
					this.sessions.set(action.sessionId, {
						sessionId: action.sessionId,
						paneId,
						pid: actionResult?.pid,
						description: action.description,
						createdAt: now,
						lastSeenAt: now,
					});
					break;
				}
			}
		}
	}

	private async refreshMissingPids(): Promise<void> {
		for (const session of this.sessions.values()) {
			if (session.pid) continue;
			const pid = await getPanePid(session.paneId);
			if (pid) {
				session.pid = pid;
			}
		}
	}

	private async fetchSessionStatuses(): Promise<Record<string, { type?: string }>> {
		try {
			const result = await this.ctx.client.session.status({
				path: undefined,
				throwOnError: false,
			});
			const data = unwrapResponse<Record<string, { type?: string }>>(result);
			if (!data || typeof data !== 'object') return {};
			return data;
		} catch {
			return {};
		}
	}

	/**
	 * Find and report orphaned processes (does NOT kill them by default).
	 * Call this manually if you need to identify orphaned processes after a crash.
	 *
	 * Note: This method only reports - it does not kill processes because we cannot
	 * reliably distinguish between processes we spawned vs user-initiated sessions.
	 * The shutdown cleanup (cleanup/cleanupSync) is safe because it only kills PIDs
	 * we explicitly tracked during this session.
	 */
	async reportOrphanedProcesses(): Promise<number[]> {
		if (!this.isEnabled()) return [];
		const serverKey = this.getServerKey();
		if (!serverKey) return [];

		const trackedSessionIds = new Set(this.sessions.keys());
		const panes = await findOwnedAgentPanes(serverKey);
		const orphanedPanes = panes.filter((pane) => {
			if (!pane.sessionId) return false;
			return !trackedSessionIds.has(pane.sessionId);
		});

		if (orphanedPanes.length > 0) {
			const sessionIds = orphanedPanes
				.map((pane) => pane.sessionId)
				.filter((sessionId): sessionId is string => !!sessionId);
			this.log(
				`Found ${orphanedPanes.length} potentially orphaned sessions: ${sessionIds.join(', ')}`
			);
			this.log(
				'These may be user-initiated sessions. Close their tmux panes manually if needed.'
			);
		}

		return orphanedPanes
			.map((pane) => pane.panePid)
			.filter((pid): pid is number => typeof pid === 'number');
	}

	/**
	 * Kill a process and all its children synchronously.
	 *
	 * This is necessary because we spawn `bash -c "opencode attach ...; tmux kill-pane"`
	 * and #{pane_pid} returns the bash PID, not the opencode attach PID.
	 */
	private killProcessByPidSync(pid: number): void {
		if (!Number.isFinite(pid) || pid <= 0) return;

		// First, kill all child processes
		try {
			spawnSync(['pkill', '-TERM', '-P', String(pid)]);
		} catch {
			// Ignore errors - children may not exist
		}

		// Then kill the parent
		try {
			process.kill(pid, 'SIGTERM');
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === 'ESRCH') return;
			return;
		}

		// Wait for processes to die
		try {
			const buffer = new SharedArrayBuffer(4);
			const view = new Int32Array(buffer);
			Atomics.wait(view, 0, 0, 1000);
		} catch {
			// ignore sleep errors
		}

		// Check if parent is dead
		try {
			process.kill(pid, 0);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === 'ESRCH') return; // Dead, good
		}

		// Force kill children
		try {
			spawnSync(['pkill', '-KILL', '-P', String(pid)]);
		} catch {
			// Ignore errors
		}

		// Force kill parent
		try {
			process.kill(pid, 'SIGKILL');
		} catch {
			// ignore errors
		}
	}

	private log(message: string): void {
		this.callbacks?.onLog?.(`[tmux] ${message}`);
	}

	/**
	 * Static method to clean up orphaned processes without needing an instance.
	 * This is useful for manual cleanup commands.
	 *
	 * @param serverUrl - Optional server URL to filter processes
	 * @param logger - Optional logging function
	 * @param instanceId - Ownership instance id to target cleanup
	 * @returns Object with cleanup results
	 */
	static async cleanupOrphans(
		serverUrl?: string,
		logger?: (msg: string) => void,
		instanceId?: string
	): Promise<{ killed: number; windowClosed: boolean }> {
		const log = logger ?? (() => {});

		log('Starting orphan cleanup...');

		let serverKey: string | undefined;
		try {
			serverKey = serverUrl ? canonicalizeServerUrl(serverUrl) : undefined;
		} catch {
			serverKey = undefined;
		}
		if (!serverKey || !instanceId) {
			log('No server URL or instance ID provided; skipping ownership cleanup.');
			return { killed: 0, windowClosed: false };
		}

		const result = await cleanupOwnedResources(serverKey, instanceId);
		log(
			`Orphan cleanup complete: ${result.panesClosed} panes closed, window closed: ${result.windowClosed}`
		);
		return { killed: result.panesClosed, windowClosed: result.windowClosed };
	}
}

function findPane(state: WindowState, paneId: string): TmuxPaneInfo | undefined {
	if (state.mainPane?.paneId === paneId) return state.mainPane;
	return state.agentPanes.find((pane) => pane.paneId === paneId);
}

function unwrapResponse<T>(result: unknown): T | undefined {
	if (typeof result === 'object' && result !== null && 'data' in result) {
		return (result as { data?: T }).data;
	}
	return result as T;
}
