import type { PluginInput } from '@opencode-ai/plugin';
import { agents } from '../agents';
import type { AgentDefinition } from '../agents';
import type { DBTextPart, OpenCodeDBReader } from '../sqlite';
import type {
	BackgroundTask,
	BackgroundTaskConfig,
	BackgroundTaskStatus,
	LaunchInput,
	TaskInspection,
	TaskProgress,
} from './types';
import { ConcurrencyManager } from './concurrency';

const DEFAULT_BACKGROUND_CONFIG: BackgroundTaskConfig = {
	enabled: true,
	defaultConcurrency: 1,
	staleTimeoutMs: 30 * 60 * 1000,
};

type MessagePart = {
	type?: string;
	text?: string;
	tool?: string;
	callID?: string;
	state?: { status?: string };
	sessionID?: string;
};

type EventPayload = {
	type: string;
	properties?: Record<string, unknown>;
};

export interface BackgroundManagerCallbacks {
	onSubagentSessionCreated?: (event: {
		sessionId: string;
		parentId: string;
		title: string;
	}) => void;
	onSubagentSessionDeleted?: (event: { sessionId: string }) => void;
	onShutdown?: () => void | Promise<void>;
}

export class BackgroundManager {
	private ctx: PluginInput;
	private config: BackgroundTaskConfig;
	private concurrency: ConcurrencyManager;
	private callbacks?: BackgroundManagerCallbacks;
	private dbReader?: OpenCodeDBReader;
	private serverUrl: string | undefined;
	private authHeaders: Record<string, string> | undefined;
	private tasks = new Map<string, BackgroundTask>();
	private tasksByParent = new Map<string, Set<string>>();
	private tasksBySession = new Map<string, string>();
	private notifications = new Map<string, Set<string>>();
	private toolCallIds = new Map<string, Set<string>>();
	private shuttingDown = false;

	constructor(
		ctx: PluginInput,
		config?: BackgroundTaskConfig,
		callbacks?: BackgroundManagerCallbacks,
		dbReader?: OpenCodeDBReader
	) {
		this.ctx = ctx;
		this.config = { ...DEFAULT_BACKGROUND_CONFIG, ...config };
		this.concurrency = new ConcurrencyManager({
			defaultLimit: this.config.defaultConcurrency,
			limits: buildConcurrencyLimits(this.config),
		});
		this.callbacks = callbacks;
		this.dbReader = dbReader;
		this.serverUrl = this.resolveServerUrl();
		this.authHeaders = this.resolveAuthHeaders();
	}

	/**
	 * Resolve the server URL from the plugin context.
	 * Mirrors the defensive pattern used in the tmux manager to handle
	 * sandbox environments where the client may not have a baseUrl configured.
	 */
	private resolveServerUrl(): string | undefined {
		const ctx = this.ctx as unknown as {
			serverUrl?: string | URL;
			baseUrl?: string | URL;
			client?: { baseUrl?: string | URL };
		};
		const serverUrl = ctx.serverUrl ?? ctx.baseUrl ?? ctx.client?.baseUrl;
		if (!serverUrl) return undefined;
		const urlStr = typeof serverUrl === 'string' ? serverUrl : serverUrl.toString();
		// Strip trailing slash to prevent double-slash when SDK appends paths like /session
		return urlStr.replace(/\/+$/, '');
	}

	/**
	 * Resolve authentication headers from environment variables.
	 *
	 * Reads `OPENCODE_SERVER_USERNAME` and `OPENCODE_SERVER_PASSWORD` (set
	 * automatically by the OpenCode server in sandbox environments) and
	 * produces a Basic Auth header (`base64("username:password")`).
	 *
	 * In sandbox environments the SDK client's default auth may not carry over
	 * when a per-call `baseUrl` override is provided, so we need to explicitly
	 * attach these credentials for server-to-server requests.
	 */
	private resolveAuthHeaders(): Record<string, string> | undefined {
		const username = process.env.OPENCODE_SERVER_USERNAME;
		const password = process.env.OPENCODE_SERVER_PASSWORD;
		if (!username || !password) return undefined;
		const encoded = Buffer.from(username + ':' + password).toString('base64');
		return { Authorization: `Basic ${encoded}` };
	}

	/**
	 * Build the per-call client overrides (baseUrl + auth headers).
	 * Spread this into every SDK client call so both the server URL and
	 * authentication are correctly forwarded in sandbox environments.
	 */
	private getClientOverrides(): { baseUrl?: string; headers?: Record<string, string> } {
		const overrides: { baseUrl?: string; headers?: Record<string, string> } = {};
		if (this.serverUrl) overrides.baseUrl = this.serverUrl;
		if (this.authHeaders) overrides.headers = this.authHeaders;
		return overrides;
	}

	async launch(input: LaunchInput): Promise<BackgroundTask> {
		const task: BackgroundTask = {
			id: createTaskId(),
			parentSessionId: input.parentSessionId,
			parentMessageId: input.parentMessageId,
			description: input.description,
			prompt: input.prompt,
			agent: input.agent,
			status: 'pending',
			queuedAt: new Date(),
			concurrencyGroup: this.getConcurrencyGroup(input.agent),
		};

		this.tasks.set(task.id, task);
		this.indexTask(task);

		if (!this.config.enabled) {
			task.status = 'error';
			task.error = 'Background tasks are disabled.';
			task.completedAt = new Date();
			this.markForNotification(task);
			return task;
		}

		void this.startTask(task);
		return task;
	}

	getTask(id: string): BackgroundTask | undefined {
		return this.tasks.get(id);
	}

	getTasksByParent(sessionId: string): BackgroundTask[] {
		const ids = this.tasksByParent.get(sessionId);
		if (!ids) return [];
		return Array.from(ids)
			.map((id) => this.tasks.get(id))
			.filter((task): task is BackgroundTask => Boolean(task));
	}

	findBySession(sessionId: string): BackgroundTask | undefined {
		const taskId = this.tasksBySession.get(sessionId);
		if (!taskId) return undefined;
		return this.tasks.get(taskId);
	}

	/**
	 * Inspect a background task by fetching its session messages.
	 * Useful for seeing what a child Lead or other agent is doing.
	 */
	async inspectTask(taskId: string): Promise<TaskInspection | undefined> {
		const task = this.tasks.get(taskId);
		if (!task?.sessionId) return undefined;

		try {
			if (this.dbReader?.isAvailable()) {
				const session = this.dbReader.getSession(task.sessionId);
				const messageCount = this.dbReader.getMessageCount(task.sessionId);
				const messageLimit = messageCount > 0 ? messageCount : 100;
				const messageRows = this.dbReader.getMessages(task.sessionId, {
					limit: messageLimit,
					offset: 0,
				});
				const textParts = this.dbReader.getTextParts(task.sessionId, {
					limit: Math.max(messageLimit * 5, 200),
				});
				const partsByMessage = groupTextPartsByMessage(textParts);
				const messages = messageRows
					.sort((a, b) => a.timeCreated - b.timeCreated)
					.map((message) => ({
						info: {
							role: message.role,
							agent: message.agent,
							model: message.model,
							cost: message.cost,
							tokens: message.tokens,
							error: message.error,
							timeCreated: message.timeCreated,
							timeUpdated: message.timeUpdated,
						},
						parts: buildTextParts(partsByMessage.get(message.id)),
					}));
				const activeTools = this.dbReader.getActiveToolCalls(task.sessionId).map((tool) => ({
					tool: tool.tool,
					status: tool.status,
					callId: tool.callId,
				}));
				const todos = this.dbReader.getTodos(task.sessionId).map((todo) => ({
					content: todo.content,
					status: todo.status,
					priority: todo.priority,
				}));
				const cost = this.dbReader.getSessionCost(task.sessionId);
				const childSessionCount = this.dbReader.getChildSessions(task.sessionId).length;

				return {
					taskId: task.id,
					sessionId: task.sessionId,
					status: task.status,
					session,
					messages,
					lastActivity: task.progress?.lastUpdate?.toISOString(),
					messageCount,
					activeTools,
					todos,
					costSummary: {
						totalCost: cost.totalCost,
						totalTokens: cost.totalTokens,
					},
					childSessionCount,
				};
			}

			// Get session details
			const sessionResponse = await this.ctx.client.session.get({
				path: { id: task.sessionId },
				throwOnError: false,
				...this.getClientOverrides(),
			});

			// Get messages from the session
			const messagesResponse = await this.ctx.client.session.messages({
				path: { id: task.sessionId },
				throwOnError: false,
				...this.getClientOverrides(),
			});

			const session = unwrapResponse<unknown>(sessionResponse);
			const rawMessages =
				unwrapResponse<Array<{ info: unknown; parts: unknown[] }>>(messagesResponse);
			// Defensive array coercion (response may be non-array when throwOnError is false)
			const messages = Array.isArray(rawMessages) ? rawMessages : [];

			// Return structured inspection result
			return {
				taskId: task.id,
				sessionId: task.sessionId,
				status: task.status,
				session,
				messages,
				lastActivity: task.progress?.lastUpdate?.toISOString(),
			};
		} catch {
			// Session might not exist anymore
			return undefined;
		}
	}

	/**
	 * Refresh task statuses from the server.
	 * Useful for recovering state after issues or checking on stuck tasks.
	 */
	async refreshStatuses(): Promise<Map<string, BackgroundTaskStatus>> {
		const results = new Map<string, BackgroundTaskStatus>();

		// Get all our tracked session IDs
		const sessionIds = Array.from(this.tasksBySession.keys());
		if (sessionIds.length === 0) return results;

		try {
			// Fetch children for each unique parent (more efficient than individual gets)
			const parentIds = new Set<string>();
			for (const task of this.tasks.values()) {
				if (task.parentSessionId) {
					parentIds.add(task.parentSessionId);
				}
			}

			const completionPromises: Promise<void>[] = [];

			for (const parentId of parentIds) {
				const childrenResponse = await this.ctx.client.session.children({
					path: { id: parentId },
					throwOnError: false,
					...this.getClientOverrides(),
				});

				const rawChildren = unwrapResponse<Array<unknown>>(childrenResponse);
				const children = Array.isArray(rawChildren) ? rawChildren : [];
				for (const child of children) {
					const childSession = child as { id?: string; status?: { type?: string } };
					if (!childSession.id) continue;

					const matchedTaskId = this.tasksBySession.get(childSession.id);
					if (matchedTaskId) {
						const task = this.tasks.get(matchedTaskId);
						if (task) {
							const newStatus = this.mapSessionStatusToTaskStatus(childSession);
							if (newStatus !== task.status) {
								// Use proper handlers to trigger side effects (concurrency, notifications, etc.)
								if (newStatus === 'completed' && task.status === 'running') {
									completionPromises.push(this.completeTask(task));
									results.set(matchedTaskId, newStatus);
								} else if (newStatus === 'error') {
									this.failTask(task, 'Session ended with error');
									results.set(matchedTaskId, newStatus);
								} else {
									// For other transitions (e.g., pending -> running), direct update is fine
									task.status = newStatus;
									results.set(matchedTaskId, newStatus);
								}
							}
						}
					}
				}
			}

			// Wait for all completion handlers to finish
			await Promise.all(completionPromises);
		} catch (error) {
			// Log but don't fail - this is a best-effort refresh
			console.error('Failed to refresh task statuses:', error);
		}

		return results;
	}

	/**
	 * Recover background tasks from existing sessions.
	 * Call this on plugin startup to restore state after restart.
	 *
	 * This method queries all sessions and reconstructs task state from
	 * sessions that have JSON-encoded task metadata in their title.
	 *
	 * @returns The number of tasks recovered
	 */
	async recoverTasks(): Promise<number> {
		let recovered = 0;

		try {
			if (this.dbReader?.isAvailable()) {
				const parentSessionId = process.env.AGENTUITY_OPENCODE_SESSION;
				if (parentSessionId) {
					const sessions = this.dbReader.getChildSessions(parentSessionId);
					for (const sess of sessions) {
						if (!sess.title?.startsWith('{')) continue;

						try {
							const metadata = JSON.parse(sess.title) as {
								taskId?: string;
								agent?: string;
								description?: string;
								createdAt?: string;
							};

							if (!metadata.taskId || !metadata.taskId.startsWith('bg_')) continue;
							if (this.tasks.has(metadata.taskId)) continue;

							const agentName = metadata.agent ?? 'unknown';
							const task: BackgroundTask = {
								id: metadata.taskId,
								sessionId: sess.id,
								parentSessionId: sess.parentId ?? '',
								agent: agentName,
								description: metadata.description ?? '',
								prompt: '',
								status: this.mapDbStatusToTaskStatus(sess.id),
								queuedAt: metadata.createdAt ? new Date(metadata.createdAt) : new Date(),
								startedAt: metadata.createdAt ? new Date(metadata.createdAt) : new Date(),
								concurrencyGroup: this.getConcurrencyGroup(agentName),
								progress: {
									toolCalls: 0,
									lastUpdate: new Date(),
								},
							};

							this.tasks.set(task.id, task);
							this.tasksBySession.set(sess.id, task.id);

							if (task.parentSessionId) {
								const parentTasks =
									this.tasksByParent.get(task.parentSessionId) ?? new Set();
								parentTasks.add(task.id);
								this.tasksByParent.set(task.parentSessionId, parentTasks);
							}

							recovered++;
						} catch {
							continue;
						}
					}
					return recovered;
				}
			}

			// Get all sessions
			const sessionsResponse = await this.ctx.client.session.list({
				throwOnError: false,
				...this.getClientOverrides(),
			});

			const rawSessions = unwrapResponse<Array<unknown>>(sessionsResponse);
			const sessions = Array.isArray(rawSessions) ? rawSessions : [];

			for (const session of sessions) {
				const sess = session as {
					id?: string;
					title?: string;
					parentID?: string;
					status?: { type?: string };
				};

				// Check if this is one of our background task sessions
				// Our sessions have JSON-encoded task metadata in the title
				if (!sess.title?.startsWith('{')) continue;

				try {
					const metadata = JSON.parse(sess.title) as {
						taskId?: string;
						agent?: string;
						description?: string;
						createdAt?: string;
					};

					// Skip if not a valid task metadata (must have taskId starting with 'bg_')
					if (!metadata.taskId || !metadata.taskId.startsWith('bg_')) continue;

					// Skip if we already have this task
					if (this.tasks.has(metadata.taskId)) continue;

					// Skip sessions without an ID
					if (!sess.id) continue;

					// Reconstruct the task
					const agentName = metadata.agent ?? 'unknown';
					const task: BackgroundTask = {
						id: metadata.taskId,
						sessionId: sess.id,
						parentSessionId: sess.parentID ?? '',
						agent: agentName,
						description: metadata.description ?? '',
						prompt: '', // Original prompt not stored in metadata
						status: this.mapSessionStatusToTaskStatus(sess),
						queuedAt: metadata.createdAt ? new Date(metadata.createdAt) : new Date(),
						startedAt: metadata.createdAt ? new Date(metadata.createdAt) : new Date(),
						concurrencyGroup: this.getConcurrencyGroup(agentName),
						progress: {
							toolCalls: 0,
							lastUpdate: new Date(),
						},
					};

					// Add to our tracking maps
					this.tasks.set(task.id, task);
					this.tasksBySession.set(sess.id, task.id);

					if (task.parentSessionId) {
						const parentTasks = this.tasksByParent.get(task.parentSessionId) ?? new Set();
						parentTasks.add(task.id);
						this.tasksByParent.set(task.parentSessionId, parentTasks);
					}

					recovered++;
				} catch {
					// Not valid JSON or not our task, skip
					continue;
				}
			}
		} catch (error) {
			console.error('Failed to recover tasks:', error);
		}

		return recovered;
	}

	private mapSessionStatusToTaskStatus(session: unknown): BackgroundTaskStatus {
		// Map OpenCode session status to our task status
		// Session status types: 'idle' | 'pending' | 'running' | 'error'
		const status = (session as { status?: { type?: string } })?.status?.type;
		switch (status) {
			case 'idle':
				return 'completed';
			case 'pending':
				return 'pending';
			case 'running':
				return 'running';
			case 'error':
				return 'error';
			default:
				// Unknown session status - default to pending for best-effort recovery
				return 'pending';
		}
	}

	cancel(taskId: string): boolean {
		const task = this.tasks.get(taskId);
		if (!task || task.status === 'completed' || task.status === 'error') {
			return false;
		}

		task.status = 'cancelled';
		task.completedAt = new Date();
		this.releaseConcurrency(task);
		this.markForNotification(task);

		if (task.sessionId) {
			void this.abortSession(task.sessionId);
			this.callbacks?.onSubagentSessionDeleted?.({ sessionId: task.sessionId });
		}

		return true;
	}

	handleEvent(event: EventPayload): void {
		if (!event || typeof event.type !== 'string') return;

		this.expireStaleTasks();

		if (event.type === 'message.part.updated') {
			const part = event.properties?.part as MessagePart | undefined;
			if (!part) return;
			const sessionId = part.sessionID;
			if (!sessionId) return;
			const task = this.findBySession(sessionId);
			if (!task) return;
			this.updateProgress(task, part);
			return;
		}

		if (event.type === 'session.idle') {
			const sessionId = extractSessionId(event.properties);
			const task = sessionId ? this.findBySession(sessionId) : undefined;
			if (!task) return;
			void this.completeTask(task);
			return;
		}

		if (event.type === 'session.error') {
			const sessionId = extractSessionId(event.properties);
			const task = sessionId ? this.findBySession(sessionId) : undefined;
			if (!task) return;
			const error = extractError(event.properties);
			this.failTask(task, error ?? 'Session error.');
			return;
		}
	}

	markForNotification(task: BackgroundTask): void {
		const sessionId = task.parentSessionId;
		if (!sessionId) return;
		const queue = this.notifications.get(sessionId) ?? new Set<string>();
		queue.add(task.id);
		this.notifications.set(sessionId, queue);
	}

	getPendingNotifications(sessionId: string): BackgroundTask[] {
		const queue = this.notifications.get(sessionId);
		if (!queue) return [];
		return Array.from(queue)
			.map((id) => this.tasks.get(id))
			.filter((task): task is BackgroundTask => Boolean(task));
	}

	clearNotifications(sessionId: string): void {
		this.notifications.delete(sessionId);
	}

	shutdown(): void {
		this.shuttingDown = true;
		this.concurrency.clear();
		this.notifications.clear();
		try {
			void this.callbacks?.onShutdown?.();
		} catch {
			// Ignore shutdown callback errors
		}
	}

	private indexTask(task: BackgroundTask): void {
		const parentList = this.tasksByParent.get(task.parentSessionId) ?? new Set<string>();
		parentList.add(task.id);
		this.tasksByParent.set(task.parentSessionId, parentList);
	}

	private async startTask(task: BackgroundTask): Promise<void> {
		if (this.shuttingDown) return;

		const concurrencyKey = this.getConcurrencyKey(task.agent);
		task.concurrencyKey = concurrencyKey;

		try {
			await this.concurrency.acquire(concurrencyKey);
		} catch (error) {
			if (task.status !== 'cancelled') {
				task.status = 'error';
				task.error = extractErrorMessage(error, 'Failed to acquire slot.');
				task.completedAt = new Date();
				this.markForNotification(task);
			}
			return;
		}

		if (task.status === 'cancelled') {
			this.releaseConcurrency(task);
			return;
		}

		try {
			// Store task metadata in session title for persistence/recovery
			const taskMetadata = JSON.stringify({
				taskId: task.id,
				agent: task.agent,
				description: task.description,
				createdAt: task.queuedAt?.toISOString() ?? new Date().toISOString(),
			});

			const sessionResult = await this.ctx.client.session.create({
				body: {
					parentID: task.parentSessionId,
					title: taskMetadata,
				},
				throwOnError: true,
				...this.getClientOverrides(),
			});
			const session = unwrapResponse<{ id: string }>(sessionResult);
			if (!session?.id) {
				throw new Error('Failed to create session.');
			}

			task.sessionId = session.id;
			task.status = 'running';
			task.startedAt = new Date();
			this.tasksBySession.set(session.id, task.id);
			this.callbacks?.onSubagentSessionCreated?.({
				sessionId: session.id,
				parentId: task.parentSessionId,
				title: task.description,
			});

			await this.ctx.client.session.prompt({
				path: { id: session.id },
				body: {
					agent: task.agent,
					parts: [{ type: 'text', text: task.prompt }],
				},
				throwOnError: true,
				...this.getClientOverrides(),
			});
		} catch (error) {
			const errorMsg = extractErrorMessage(error, 'Failed to launch background task.');
			// Log the actual error for debugging — critical in sandbox environments
			// where the client may silently fail due to missing baseUrl
			try {
				void this.ctx.client.app.log({
					body: {
						service: 'agentuity-coder',
						level: 'error',
						message: `Background task ${task.id} failed to start: ${errorMsg}`,
					},
					...this.getClientOverrides(),
				});
			} catch {
				// If logging also fails, fall back to console
				console.error(`[BackgroundManager] Task ${task.id} failed to start:`, errorMsg);
			}
			this.failTask(task, errorMsg);
		}
	}

	private updateProgress(task: BackgroundTask, part: MessagePart): void {
		const progress = task.progress ?? this.createProgress();
		progress.lastUpdate = new Date();

		if (part.type === 'tool') {
			const callId = part.callID;
			const toolName = part.tool;
			if (toolName) {
				progress.lastTool = toolName;
			}
			if (callId) {
				const seen = this.toolCallIds.get(task.id) ?? new Set<string>();
				if (!seen.has(callId)) {
					seen.add(callId);
					progress.toolCalls += 1;
					this.toolCallIds.set(task.id, seen);
				}
			}
		}

		if (part.type === 'text' && part.text) {
			progress.lastMessage = part.text;
			progress.lastMessageAt = new Date();
		}

		task.progress = progress;
	}

	private createProgress(): TaskProgress {
		return {
			toolCalls: 0,
			lastUpdate: new Date(),
		};
	}

	private async completeTask(task: BackgroundTask): Promise<void> {
		if (task.status !== 'running') return;

		task.status = 'completed';
		task.completedAt = new Date();
		this.releaseConcurrency(task);

		if (task.sessionId) {
			const result = await this.fetchLatestResult(task.sessionId);
			if (result) {
				task.result = result;
			}
			this.callbacks?.onSubagentSessionDeleted?.({ sessionId: task.sessionId });
		}

		this.markForNotification(task);
		void this.notifyParent(task);
	}

	private failTask(task: BackgroundTask, error: string): void {
		if (task.status === 'completed' || task.status === 'error') return;
		task.status = 'error';
		task.error = error;
		task.completedAt = new Date();
		this.releaseConcurrency(task);
		if (task.sessionId) {
			this.callbacks?.onSubagentSessionDeleted?.({ sessionId: task.sessionId });
		}
		this.markForNotification(task);
		void this.notifyParent(task);
	}

	private releaseConcurrency(task: BackgroundTask): void {
		if (!task.concurrencyKey) return;
		this.concurrency.release(task.concurrencyKey);
		delete task.concurrencyKey;
	}

	private async notifyParent(task: BackgroundTask): Promise<void> {
		if (!task.parentSessionId) return;

		// Prevent duplicate notifications for the same task+status combination
		// This guards against OpenCode firing multiple events for the same status transition
		const notifiedStatuses = task.notifiedStatuses ?? new Set();

		// Self-healing for tasks created before deduplication was added:
		// If a task is already in a terminal state but has no notification history,
		// assume it was already notified and skip to prevent duplicate notifications.
		if (
			notifiedStatuses.size === 0 &&
			(task.status === 'completed' || task.status === 'error' || task.status === 'cancelled')
		) {
			notifiedStatuses.add(task.status);
			task.notifiedStatuses = notifiedStatuses;
			return;
		}

		if (notifiedStatuses.has(task.status)) {
			return; // Already notified for this status, skip duplicate
		}
		// Mark as notified BEFORE sending to prevent race conditions
		notifiedStatuses.add(task.status);
		task.notifiedStatuses = notifiedStatuses;

		const statusLine = task.status === 'completed' ? 'completed' : task.status;
		const message = `[BACKGROUND TASK ${statusLine.toUpperCase()}]

Task: ${task.description}
Agent: ${task.agent}
Status: ${task.status}
Task ID: ${task.id}

Use the agentuity_background_output tool with task_id "${task.id}" to view the result.`;

		try {
			await this.ctx.client.session.prompt({
				path: { id: task.parentSessionId },
				body: {
					parts: [{ type: 'text', text: message }],
				},
				throwOnError: true,
				responseStyle: 'data',
				...this.getClientOverrides(),
			});
		} catch (error) {
			console.error(
				`[BackgroundManager] Failed to notify parent for task ${task.id}:`,
				extractErrorMessage(error, 'notification failed')
			);
		}
	}

	private async abortSession(sessionId: string): Promise<void> {
		try {
			await this.ctx.client.session.abort({
				path: { id: sessionId },
				throwOnError: false,
				...this.getClientOverrides(),
			});
		} catch {
			// Ignore abort errors
		}
	}

	private async fetchLatestResult(sessionId: string): Promise<string | undefined> {
		try {
			if (this.dbReader?.isAvailable()) {
				const messages = this.dbReader.getMessages(sessionId, { limit: 100, offset: 0 });
				const textParts = this.dbReader.getTextParts(sessionId, { limit: 300 });
				const partsByMessage = groupTextPartsByMessage(textParts);
				for (const message of messages) {
					if (message.role !== 'assistant') continue;
					const text = joinTextParts(partsByMessage.get(message.id));
					if (text) return text;
				}
				return undefined;
			}

			const messagesResult = await this.ctx.client.session.messages({
				path: { id: sessionId },
				throwOnError: true,
				...this.getClientOverrides(),
			});
			const messages = unwrapResponse<Array<unknown>>(messagesResult) ?? [];
			const entries = Array.isArray(messages) ? messages : [];
			for (let i = entries.length - 1; i >= 0; i -= 1) {
				const entry = entries[i] as { info?: { role?: string }; parts?: Array<unknown> };
				if (entry?.info?.role !== 'assistant') continue;
				const text = extractTextFromParts(entry.parts ?? []);
				if (text) return text;
			}
		} catch {
			return undefined;
		}

		return undefined;
	}

	private mapDbStatusToTaskStatus(sessionId: string): BackgroundTaskStatus {
		if (!this.dbReader) return 'pending';
		const status = this.dbReader.getSessionStatus(sessionId).status;
		switch (status) {
			case 'idle':
			case 'archived':
				return 'completed';
			case 'active':
			case 'compacting':
				return 'running';
			case 'error':
				return 'error';
			default:
				return 'pending';
		}
	}

	private getConcurrencyGroup(agentName: string): string | undefined {
		const model = getAgentModel(agentName);
		if (!model) return undefined;
		const provider = model.split('/')[0];
		if (model && this.config.modelConcurrency?.[model] !== undefined) {
			return `model:${model}`;
		}
		if (provider && this.config.providerConcurrency?.[provider] !== undefined) {
			return `provider:${provider}`;
		}
		return undefined;
	}

	private getConcurrencyKey(agentName: string): string {
		const group = this.getConcurrencyGroup(agentName);
		return group ?? 'default';
	}

	private expireStaleTasks(): void {
		const now = Date.now();
		for (const task of this.tasks.values()) {
			if (task.status !== 'pending' && task.status !== 'running') continue;
			const start = task.startedAt?.getTime() ?? task.queuedAt?.getTime();
			if (!start) continue;
			if (now - start > this.config.staleTimeoutMs) {
				this.failTask(task, 'Background task timed out.');
			}
		}
	}
}

function buildConcurrencyLimits(config: BackgroundTaskConfig): Record<string, number> {
	const limits: Record<string, number> = {};
	if (config.providerConcurrency) {
		for (const [provider, limit] of Object.entries(config.providerConcurrency)) {
			limits[`provider:${provider}`] = limit;
		}
	}
	if (config.modelConcurrency) {
		for (const [model, limit] of Object.entries(config.modelConcurrency)) {
			limits[`model:${model}`] = limit;
		}
	}
	return limits;
}

function getAgentModel(agentName: string): string | undefined {
	const agent = findAgentDefinition(agentName);
	return agent?.defaultModel;
}

function findAgentDefinition(agentName: string): AgentDefinition | undefined {
	return Object.values(agents).find(
		(agent) =>
			agent.displayName === agentName || agent.id === agentName || agent.role === agentName
	);
}

function createTaskId(): string {
	return `bg_${Math.random().toString(36).slice(2, 8)}`;
}

function extractSessionId(properties?: Record<string, unknown>): string | undefined {
	return (
		(properties?.sessionId as string | undefined) ?? (properties?.sessionID as string | undefined)
	);
}

function extractError(properties?: Record<string, unknown>): string | undefined {
	const error = properties?.error as { data?: { message?: string }; name?: string } | undefined;
	return error?.data?.message ?? (typeof error?.name === 'string' ? error.name : undefined);
}

function extractTextFromParts(parts: Array<unknown>): string | undefined {
	const textParts: string[] = [];
	for (const part of parts) {
		if (typeof part !== 'object' || part === null) continue;
		const typed = part as { type?: string; text?: string };
		if (typed.type === 'text' && typeof typed.text === 'string') {
			textParts.push(typed.text);
		}
	}
	if (textParts.length === 0) return undefined;
	return textParts.join('\n');
}

function groupTextPartsByMessage(parts: DBTextPart[]): Map<string, DBTextPart[]> {
	const grouped = new Map<string, DBTextPart[]>();
	for (const part of parts) {
		const list = grouped.get(part.messageId) ?? [];
		list.push(part);
		grouped.set(part.messageId, list);
	}
	for (const list of grouped.values()) {
		list.sort((a, b) => a.timeCreated - b.timeCreated);
	}
	return grouped;
}

function buildTextParts(parts?: DBTextPart[]): Array<{ type: string; text: string }> {
	if (!parts || parts.length === 0) return [];
	return parts.map((part) => ({ type: 'text', text: part.text }));
}

function joinTextParts(parts?: DBTextPart[]): string | undefined {
	if (!parts || parts.length === 0) return undefined;
	return parts.map((part) => part.text).join('\n');
}

function unwrapResponse<T>(result: unknown): T | undefined {
	if (typeof result === 'object' && result !== null && 'data' in result) {
		return (result as { data?: T }).data;
	}
	return result as T;
}

/**
 * Extract an error message from an unknown thrown value.
 *
 * The OpenCode SDK client (with `throwOnError: true`) throws **plain objects**
 * (e.g. `{ message: "Not Found" }`) or raw strings rather than `Error` instances.
 * This helper normalises all shapes into a usable string.
 */
function extractErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error || fallback;
	if (typeof error === 'object' && error !== null) {
		const obj = error as Record<string, unknown>;
		if (typeof obj.message === 'string') return obj.message || fallback;
		if (typeof obj.error === 'string') return obj.error || fallback;
		if (typeof obj.error === 'object' && obj.error !== null) {
			return extractErrorMessage(obj.error, fallback);
		}
	}
	return fallback;
}
