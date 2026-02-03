import type { PluginInput } from '@opencode-ai/plugin';
import { agents } from '../agents';
import type { AgentDefinition } from '../agents';
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
	private tasks = new Map<string, BackgroundTask>();
	private tasksByParent = new Map<string, Set<string>>();
	private tasksBySession = new Map<string, string>();
	private notifications = new Map<string, Set<string>>();
	private toolCallIds = new Map<string, Set<string>>();
	private shuttingDown = false;

	constructor(
		ctx: PluginInput,
		config?: BackgroundTaskConfig,
		callbacks?: BackgroundManagerCallbacks
	) {
		this.ctx = ctx;
		this.config = { ...DEFAULT_BACKGROUND_CONFIG, ...config };
		this.concurrency = new ConcurrencyManager({
			defaultLimit: this.config.defaultConcurrency,
			limits: buildConcurrencyLimits(this.config),
		});
		this.callbacks = callbacks;
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
			// Get session details
			const sessionResponse = await this.ctx.client.session.get({
				path: { id: task.sessionId },
				throwOnError: false,
			});

			// Get messages from the session
			const messagesResponse = await this.ctx.client.session.messages({
				path: { id: task.sessionId },
				throwOnError: false,
			});

			const session = unwrapResponse<unknown>(sessionResponse);
			const messages =
				unwrapResponse<Array<{ info: unknown; parts: unknown[] }>>(messagesResponse);

			// Return structured inspection result
			return {
				taskId: task.id,
				sessionId: task.sessionId,
				status: task.status,
				session,
				messages: messages ?? [],
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

			for (const parentId of parentIds) {
				const childrenResponse = await this.ctx.client.session.children({
					path: { id: parentId },
					throwOnError: false,
				});

				const children = unwrapResponse<Array<unknown>>(childrenResponse) ?? [];
				for (const child of children) {
					const childSession = child as { id?: string; status?: { type?: string } };
					if (!childSession.id) continue;

					const matchedTaskId = this.tasksBySession.get(childSession.id);
					if (matchedTaskId) {
						const task = this.tasks.get(matchedTaskId);
						if (task) {
							// Update task status based on session state
							const newStatus = this.mapSessionStatusToTaskStatus(childSession);
							if (newStatus !== task.status) {
								task.status = newStatus;
								results.set(matchedTaskId, newStatus);
							}
						}
					}
				}
			}
		} catch (error) {
			// Log but don't fail - this is a best-effort refresh
			console.error('Failed to refresh task statuses:', error);
		}

		return results;
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
				task.error = error instanceof Error ? error.message : 'Failed to acquire slot.';
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
			const sessionResult = await this.ctx.client.session.create({
				body: {
					parentID: task.parentSessionId,
					title: task.description,
				},
				throwOnError: true,
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
			});
		} catch (error) {
			this.failTask(
				task,
				error instanceof Error ? error.message : 'Failed to launch background task.'
			);
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
			});
		} catch {
			// Ignore notification errors
		}
	}

	private async abortSession(sessionId: string): Promise<void> {
		try {
			await this.ctx.client.session.abort({
				path: { id: sessionId },
				throwOnError: false,
			});
		} catch {
			// Ignore abort errors
		}
	}

	private async fetchLatestResult(sessionId: string): Promise<string | undefined> {
		try {
			const messagesResult = await this.ctx.client.session.messages({
				path: { id: sessionId },
				throwOnError: true,
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

function unwrapResponse<T>(result: unknown): T | undefined {
	if (typeof result === 'object' && result !== null && 'data' in result) {
		return (result as { data?: T }).data;
	}
	return result as T;
}
