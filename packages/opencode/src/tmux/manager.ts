import type { PluginInput } from '@opencode-ai/plugin';
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
import { executeActions, closeAgentsWindow, closeAgentsWindowSync } from './executor';

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
		if (!this.isEnabled()) return;
		if (this.pendingSessions.has(event.sessionId) || this.sessions.has(event.sessionId)) return;
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

			this.applyActionResults(decision.actions, result.spawnedPaneId);
			if (this.sessions.size > 0) {
				this.startPolling();
			}
		} finally {
			this.pendingSessions.delete(event.sessionId);
		}
	}

	/**
	 * Handle a session being deleted
	 *
	 * Note: Panes self-destruct when their command exits (via `; tmux kill-pane`),
	 * so we only need to update internal state here. No need to explicitly kill
	 * the pane - it will close itself when the opencode attach process ends.
	 */
	async onSessionDeleted(event: { sessionId: string }): Promise<void> {
		if (!this.isEnabled()) return;

		// Find the session in our mappings
		const session = this.sessions.get(event.sessionId);
		if (!session) return;

		// Just update internal state - pane self-destructs when command exits
		this.sessions.delete(event.sessionId);

		if (this.sessions.size === 0) {
			this.stopPolling();
		}
	}

	/**
	 * Clean up all panes on shutdown
	 *
	 * Kills the entire "Agents" window, which closes all agent panes at once.
	 */
	async cleanup(): Promise<void> {
		this.stopPolling();

		// Kill the entire agents window - this closes all panes at once
		await closeAgentsWindow();
		this.sessions.clear();
	}

	/**
	 * Synchronous cleanup for shutdown (ensures completion before exit)
	 *
	 * Uses spawnSync to guarantee the tmux commands complete before the
	 * process exits, which is necessary for signal handlers.
	 */
	cleanupSync(): void {
		this.stopPolling();

		// Kill the entire agents window synchronously
		closeAgentsWindowSync();
		this.sessions.clear();
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

	private applyActionResults(actions: PaneAction[], spawnedPaneId: string | undefined): void {
		const now = new Date();
		for (const action of actions) {
			switch (action.type) {
				case 'close':
					this.sessions.delete(action.sessionId);
					break;
				case 'replace':
					this.sessions.delete(action.oldSessionId);
					this.sessions.set(action.newSessionId, {
						sessionId: action.newSessionId,
						paneId: action.paneId,
						description: action.description,
						createdAt: now,
						lastSeenAt: now,
					});
					break;
				case 'spawn': {
					const paneId = spawnedPaneId;
					if (!paneId) break;
					this.sessions.set(action.sessionId, {
						sessionId: action.sessionId,
						paneId,
						description: action.description,
						createdAt: now,
						lastSeenAt: now,
					});
					break;
				}
			}
		}
	}

	private log(message: string): void {
		this.callbacks?.onLog?.(`[tmux] ${message}`);
	}
}

function findPane(state: WindowState, paneId: string): TmuxPaneInfo | undefined {
	if (state.mainPane?.paneId === paneId) return state.mainPane;
	return state.agentPanes.find((pane) => pane.paneId === paneId);
}
