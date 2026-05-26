import { AsyncLocalStorage } from 'node:async_hooks';
import { createMinimalLogger } from '@agentuity/core';
import type { EmailClient } from '@agentuity/email';
import type { Logger, Services } from '@agentuity/hono';
import type { KeyValueClient } from '@agentuity/keyvalue';
import type { QueueClient } from '@agentuity/queue';
import type { SandboxClient } from '@agentuity/sandbox';
import type { ScheduleClient } from '@agentuity/schedule';
import type { StreamClient } from '@agentuity/stream';
import type { TaskClient } from '@agentuity/task';
import type { VectorClient } from '@agentuity/vector';
import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

const SESSION_COOKIE = 'agentuity_explorer_session';
const THREAD_STATE_MAX_AGE_MS = 60 * 60 * 1000;

export interface StateStore {
	get<T = unknown>(key: string): Promise<T | undefined>;
	set<T = unknown>(key: string, value: T): Promise<void>;
	has(key: string): Promise<boolean>;
	delete(key: string): Promise<void>;
	entries(): Promise<[string, unknown][]>;
	push<T = unknown>(key: string, value: T, maxRecords?: number): Promise<void>;
}

export interface DemoSession {
	readonly id: string;
	readonly state: Map<string, unknown>;
}

export interface DemoThread {
	readonly id: string;
	readonly state: StateStore;
}

export interface DemoContext extends Services {
	readonly logger: Logger;
	readonly sessionId: string;
	readonly session: DemoSession;
	readonly thread: DemoThread;
	readonly state: Map<string, unknown>;
	readonly tracer: unknown;
	readonly meter: unknown;
	waitUntil(task: Promise<unknown>): void;
}

export interface ApiVariables extends Services {
	logger: Logger;
	sessionId: string;
	session: DemoSession;
	thread: DemoThread;
	tracer: unknown;
	meter: unknown;
}

export type ApiEnv = {
	Variables: ApiVariables;
};

class MemoryStateStore implements StateStore {
	readonly #values = new Map<string, unknown>();
	#lastUsedAt = Date.now();

	touch(): void {
		this.#lastUsedAt = Date.now();
	}

	get expired(): boolean {
		return Date.now() - this.#lastUsedAt > THREAD_STATE_MAX_AGE_MS;
	}

	async get<T = unknown>(key: string): Promise<T | undefined> {
		this.touch();
		return this.#values.get(key) as T | undefined;
	}

	async set<T = unknown>(key: string, value: T): Promise<void> {
		this.touch();
		this.#values.set(key, value);
	}

	async has(key: string): Promise<boolean> {
		this.touch();
		return this.#values.has(key);
	}

	async delete(key: string): Promise<void> {
		this.touch();
		this.#values.delete(key);
	}

	async entries(): Promise<[string, unknown][]> {
		this.touch();
		return Array.from(this.#values.entries());
	}

	async push<T = unknown>(key: string, value: T, maxRecords?: number): Promise<void> {
		this.touch();
		const current = this.#values.get(key);
		const values = Array.isArray(current) ? [...(current as T[]), value] : [value];
		const next =
			maxRecords !== undefined && values.length > maxRecords
				? values.slice(values.length - maxRecords)
				: values;
		this.#values.set(key, next);
	}
}

const threadStateById = new Map<string, MemoryStateStore>();
const contextStorage = new AsyncLocalStorage<DemoContext>();

let standaloneContext: DemoContext | null = null;
let sharedLogger: Logger | null = null;
let sharedServices: Services | null = null;

function createLazyServiceClient<T extends object>(loadClient: () => Promise<T>): T {
	let clientPromise: Promise<T> | undefined;

	return new Proxy(
		{},
		{
			get(_target, property) {
				if (property === 'then') return undefined;

				return async (...args: unknown[]) => {
					clientPromise ??= loadClient();
					const client = await clientPromise;
					const value = Reflect.get(client, property);

					if (typeof value !== 'function') {
						return value;
					}

					return Reflect.apply(value, client, args);
				};
			},
		}
	) as T;
}

function getThreadState(threadId: string): MemoryStateStore {
	for (const [id, store] of threadStateById) {
		if (store.expired) threadStateById.delete(id);
	}

	const existing = threadStateById.get(threadId);
	if (existing) {
		existing.touch();
		return existing;
	}

	const store = new MemoryStateStore();
	threadStateById.set(threadId, store);
	return store;
}

function createWaitUntil(logger: Logger): (task: Promise<unknown>) => void {
	return (task) => {
		void task.catch((error: unknown) => {
			logger.error('Background task failed', {
				error: error instanceof Error ? error.message : String(error),
			});
		});
	};
}

function createContext(
	services: Services,
	logger: Logger,
	sessionId: string,
	threadId: string,
	telemetry?: { tracer?: unknown; meter?: unknown }
): DemoContext {
	const sessionState = new Map<string, unknown>();
	return {
		...services,
		logger,
		sessionId,
		session: {
			id: sessionId,
			state: sessionState,
		},
		thread: {
			id: threadId,
			state: getThreadState(threadId),
		},
		state: sessionState,
		tracer: telemetry?.tracer,
		meter: telemetry?.meter,
		waitUntil: createWaitUntil(logger),
	};
}

function getStandaloneLogger(): Logger {
	sharedLogger ??= createMinimalLogger();
	return sharedLogger;
}

function getStandaloneServices(logger: Logger): Services {
	sharedServices ??= {
		kv: createLazyServiceClient<KeyValueClient>(async () => {
			const { KeyValueClient } = await import('@agentuity/keyvalue');
			return new KeyValueClient({ logger });
		}),
		stream: createLazyServiceClient<StreamClient>(async () => {
			const { StreamClient } = await import('@agentuity/stream');
			return new StreamClient({ logger });
		}),
		vector: createLazyServiceClient<VectorClient>(async () => {
			const { VectorClient } = await import('@agentuity/vector');
			return new VectorClient({ logger });
		}),
		sandbox: createLazyServiceClient<SandboxClient>(async () => {
			const { SandboxClient } = await import('@agentuity/sandbox');
			return new SandboxClient({ logger });
		}),
		queue: createLazyServiceClient<QueueClient>(async () => {
			const { QueueClient } = await import('@agentuity/queue');
			return new QueueClient({ logger });
		}),
		email: createLazyServiceClient<EmailClient>(async () => {
			const { EmailClient } = await import('@agentuity/email');
			return new EmailClient({ logger });
		}),
		schedule: createLazyServiceClient<ScheduleClient>(async () => {
			const { ScheduleClient } = await import('@agentuity/schedule');
			return new ScheduleClient({ logger });
		}),
		task: createLazyServiceClient<TaskClient>(async () => {
			const { TaskClient } = await import('@agentuity/task');
			return new TaskClient({ logger });
		}),
	};

	return sharedServices;
}

export function getDemoContext(): DemoContext {
	const context = contextStorage.getStore();
	if (context) return context;

	if (!standaloneContext) {
		const logger = getStandaloneLogger();
		standaloneContext = createContext(
			getStandaloneServices(logger),
			logger,
			`local-${crypto.randomUUID()}`,
			`thread-${crypto.randomUUID()}`
		);
	}

	return standaloneContext;
}

export function runWithDemoContext<T>(
	context: DemoContext,
	callback: () => Promise<T>
): Promise<T> {
	return contextStorage.run(context, callback);
}

function getSessionId(c: Parameters<MiddlewareHandler<ApiEnv>>[0]): string {
	const existing = getCookie(c, SESSION_COOKIE);
	if (existing) return existing;

	const sessionId = crypto.randomUUID();
	setCookie(c, SESSION_COOKIE, sessionId, {
		httpOnly: true,
		path: '/',
		sameSite: 'Lax',
		secure: new URL(c.req.url).protocol === 'https:',
		maxAge: THREAD_STATE_MAX_AGE_MS / 1000,
	});
	return sessionId;
}

export const attachDemoContext: MiddlewareHandler<ApiEnv> = async (c, next) => {
	const sessionId = getSessionId(c);
	const logger = c.var.logger ?? getStandaloneLogger();
	const services = getStandaloneServices(logger);
	const context = createContext(services, logger, sessionId, sessionId, {
		tracer: c.var.tracer,
		meter: c.var.meter,
	});

	c.set('logger', context.logger);
	c.set('kv', context.kv);
	c.set('stream', context.stream);
	c.set('vector', context.vector);
	c.set('sandbox', context.sandbox);
	c.set('queue', context.queue);
	c.set('email', context.email);
	c.set('schedule', context.schedule);
	c.set('task', context.task);
	c.set('sessionId', context.sessionId);
	c.set('session', context.session);
	c.set('thread', context.thread);

	await runWithDemoContext(context, next);
};
