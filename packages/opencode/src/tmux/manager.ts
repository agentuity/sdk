import type { PluginInput } from '@opencode-ai/plugin';
import { spawn, spawnSync } from 'bun';
import type {
	PaneAction,
	TmuxConfig,
	TmuxPaneInfo,
	TrackedSession,
	WindowState,
	SessionMapping,
} from './types';
import { POLL_INTERVAL_MS, SESSION_MISSING_GRACE_MS, SESSION_TIMEOUT_MS } from './types';
import { getCurrentPaneId, getTmuxPath, isInsideTmux } from './utils';
import { queryWindowState } from './state-query';
import { decideSpawnActions } from './decision-engine';
import {
	executeActions,
	closeAgentsWindow,
	closeAgentsWindowSync,
	closePaneById,
	killProcessByPid,
	killOrphanedAttachProcesses,
	killOrphanedAttachProcessesSync,
} from './executor';

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
 * Manages tmux panes for background agents.
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

	constructor(
		private ctx: PluginInput,
		private config: TmuxConfig,
		private callbacks?: TmuxSessionManagerCallbacks
	) {
		this.sourcePaneId = getCurrentPaneId();
	}

	/**
	 * Check if tmux integration is enabled and available
	 */
	isEnabled(): boolean {
		return this.config.enabled && isInsideTmux();
	}

	/**
	 * Handle a new background session being created
	 * This is called by BackgroundManager when a background task starts
	 */
	async onSessionCreated(event: {
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

			const result = await executeActions(decision.actions, {
				config: this.config,
				serverUrl,
				windowState: state,
			});

			if (!result.success) {
				this.log('Failed to execute tmux actions.');
				return;
			}

			this.applyActionResults(decision.actions, result.results);
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
	 * Explicitly kills the pane when a background session completes.
	 * We can't rely on `opencode attach` exiting because it's an interactive
	 * terminal that keeps running even after the session goes idle.
	 */
	async onSessionDeleted(event: { sessionId: string }): Promise<void> {
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

		let pidCleanupFailed = false;
		for (const session of this.sessions.values()) {
			if (!session.pid) continue;
			this.log(`Killing process ${session.pid} for session ${session.sessionId}`);
			const success = await killProcessByPid(session.pid);
			if (!success) {
				this.log(`Failed to kill process ${session.pid} for session ${session.sessionId}`);
				pidCleanupFailed = true;
			}
		}

		// Kill the entire agents window - this closes all panes at once
		await closeAgentsWindow();
		this.sessions.clear();

		// Fallback: if PID-based cleanup failed, use pkill to catch any orphans
		if (pidCleanupFailed) {
			this.log('PID-based cleanup had failures, running fallback cleanup...');
			const serverUrl = this.getServerUrl();
			await killOrphanedAttachProcesses(serverUrl, (msg) => this.log(msg));
		}

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

		let pidCleanupFailed = false;
		for (const session of this.sessions.values()) {
			if (!session.pid) continue;
			this.log(`Killing process ${session.pid} for session ${session.sessionId}`);
			this.killProcessByPidSync(session.pid);
			// Check if process is still alive after kill attempt
			try {
				process.kill(session.pid, 0);
				pidCleanupFailed = true; // Process still exists
			} catch {
				// Process is dead, good
			}
		}

		// Kill the entire agents window synchronously
		closeAgentsWindowSync();
		this.sessions.clear();

		// Fallback: if PID-based cleanup failed, use pkill to catch any orphans
		if (pidCleanupFailed) {
			this.log('PID-based cleanup had failures, running fallback cleanup...');
			const serverUrl = this.getServerUrl();
			killOrphanedAttachProcessesSync(serverUrl, (msg) => this.log(msg));
		}

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
		if (!this.isEnabled()) return;
		if (!this.sourcePaneId) return;

		const state = await queryWindowState(this.sourcePaneId);
		if (!state) return;

		const now = Date.now();
		for (const session of this.sessions.values()) {
			const pane = findPane(state, session.paneId);
			if (pane) {
				session.lastSeenAt = new Date();
				continue;
			}

			const missingFor = now - session.lastSeenAt.getTime();
			if (missingFor > SESSION_MISSING_GRACE_MS) {
				this.sessions.delete(session.sessionId);
				continue;
			}

			const age = now - session.createdAt.getTime();
			if (age > SESSION_TIMEOUT_MS) {
				this.sessions.delete(session.sessionId);
			}
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
		const serverUrl = this.getServerUrl();
		if (!serverUrl) return [];

		const trackedSessionIds = new Set(this.sessions.keys());
		const orphanedPids = await this.findOrphanedAttachPids(serverUrl, trackedSessionIds);

		if (orphanedPids.length > 0) {
			this.log(
				`Found ${orphanedPids.length} potentially orphaned processes: ${orphanedPids.join(', ')}`
			);
			this.log(
				'These may be user-initiated sessions. Run "pkill -f opencode\\ attach" to clean them up manually if needed.'
			);
		}

		return orphanedPids;
	}

	private async findOrphanedAttachPids(
		serverUrl: string,
		trackedSessionIds: Set<string>
	): Promise<number[]> {
		try {
			const proc = spawn(['ps', 'aux'], { stdout: 'pipe', stderr: 'pipe' });
			await proc.exited;
			const output = await new Response(proc.stdout).text();
			const lines = output.split('\n');
			const matches: number[] = [];

			for (const line of lines) {
				if (!line.includes('opencode attach')) continue;
				if (!line.includes(serverUrl)) continue;
				const parts = line.trim().split(/\s+/);
				const pid = Number(parts[1]);
				if (!Number.isFinite(pid) || pid <= 0) continue;
				if (pid === process.pid) continue;
				const sessionId = this.extractSessionId(line);
				if (sessionId && trackedSessionIds.has(sessionId)) continue;
				matches.push(pid);
			}

			return matches;
		} catch {
			return [];
		}
	}

	private extractSessionId(line: string): string | undefined {
		const match = line.match(/--session\s+(['"]?)([^'";\s]+)\1/);
		return match?.[2];
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
	 * @returns Object with cleanup results
	 */
	static async cleanupOrphans(
		serverUrl?: string,
		logger?: (msg: string) => void
	): Promise<{ killed: number; windowClosed: boolean }> {
		const log = logger ?? (() => {});

		log('Starting orphan cleanup...');

		// First, try to close the agents window (recovers from persisted file)
		let windowClosed = false;
		try {
			await closeAgentsWindow();
			windowClosed = true;
			log('Closed agents window');
		} catch {
			log('No agents window to close');
		}

		// Then kill any orphaned processes
		const killed = await killOrphanedAttachProcesses(serverUrl, log);

		log(`Orphan cleanup complete: ${killed} processes killed, window closed: ${windowClosed}`);
		return { killed, windowClosed };
	}
}

function findPane(state: WindowState, paneId: string): TmuxPaneInfo | undefined {
	if (state.mainPane?.paneId === paneId) return state.mainPane;
	return state.agentPanes.find((pane) => pane.paneId === paneId);
}
