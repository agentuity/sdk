import { describe, expect, test } from 'bun:test';
import type { AuthInterface } from '@agentuity/auth/types';
import { trace } from '@opentelemetry/api';
import { Hono } from 'hono';
import { websocket as bunWebsocket } from 'hono/bun';
import { runInHTTPContext } from '../src/_context';
import { createAgent, createAgentMiddleware } from '../src/agent';
import { websocket } from '../src/handlers/websocket';
import type { Logger } from '../src/logger';
import type { Session, Thread } from '../src/session';
import WaitUntilHandler from '../src/_waituntil';
import { z } from 'zod';

interface EchoReadyMessage {
	type: 'ready';
}

interface EchoSuccessMessage {
	type: 'echo';
	routeSessionId: string;
	routeThreadId: string;
	data: {
		echo: string;
		sessionId: string;
		threadId: string;
		userId: string | null;
	};
}

interface EchoErrorMessage {
	type: 'error';
	message: string;
}

type SocketMessage = EchoReadyMessage | EchoSuccessMessage | EchoErrorMessage;

function createMockAuth(userId: string): AuthInterface {
	return {
		user: { id: userId, email: `${userId}@example.com`, name: 'Test User' },
		session: { id: 'session-123', userId },
		authMethod: 'session',
		raw: {},
		getUser: async () => ({ id: userId, email: `${userId}@example.com`, name: 'Test User' }),
		getToken: async () => null,
		getOrg: async () => null,
		getOrgRole: async () => null,
		hasOrgRole: async () => false,
		apiKey: null,
		hasPermission: () => false,
	};
}

function createMockLogger(): Logger {
	const noop = () => {};
	return {
		trace: noop,
		debug: noop,
		info: noop,
		warn: noop,
		error: noop,
		fatal: noop as Logger['fatal'],
		child: () => createMockLogger(),
	};
}

function createMockThread(id: string): Thread {
	const thread: Thread = {
		id,
		state: new Map(),
		addEventListener: () => {},
		removeEventListener: () => {},
		destroy: async () => {},
		empty: () => thread.state.size === 0,
	};
	return thread;
}

function createMockSession(thread: Thread, id: string): Session {
	return {
		id,
		thread,
		state: new Map(),
		addEventListener: () => {},
		removeEventListener: () => {},
		serializeUserData: () => undefined,
	};
}

function waitForOpen(socket: WebSocket): Promise<void> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			socket.removeEventListener('open', onOpen);
			socket.removeEventListener('error', onError);
			socket.removeEventListener('close', onClose);
		};

		const onOpen = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error('WebSocket failed to open'));
		};
		const onClose = () => {
			cleanup();
			reject(new Error('WebSocket closed before opening'));
		};

		socket.addEventListener('open', onOpen, { once: true });
		socket.addEventListener('error', onError, { once: true });
		socket.addEventListener('close', onClose, { once: true });
	});
}

function waitForJsonMessage(socket: WebSocket): Promise<SocketMessage> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			socket.removeEventListener('message', onMessage);
			socket.removeEventListener('error', onError);
			socket.removeEventListener('close', onClose);
		};

		const onMessage = (event: MessageEvent) => {
			cleanup();
			try {
				resolve(JSON.parse(String(event.data)) as SocketMessage);
			} catch (error) {
				reject(error);
			}
		};
		const onError = () => {
			cleanup();
			reject(new Error('WebSocket errored while waiting for a message'));
		};
		const onClose = () => {
			cleanup();
			reject(new Error('WebSocket closed before a message was received'));
		};

		socket.addEventListener('message', onMessage, { once: true });
		socket.addEventListener('error', onError, { once: true });
		socket.addEventListener('close', onClose, { once: true });
	});
}

async function closeSocket(socket: WebSocket): Promise<void> {
	if (socket.readyState === WebSocket.CLOSED) {
		return;
	}

	await new Promise<void>((resolve) => {
		socket.addEventListener('close', () => resolve(), { once: true });
		socket.close();
	});
}

describe('WebSocket agent context propagation', () => {
	test('agent.run inside ws.onMessage preserves session, thread, and routed auth context', async () => {
		const tracer = trace.getTracer('websocket-agent-context-test');

		const echoAgent = createAgent('websocket-agent-context-propagation-test', {
			schema: {
				input: z.string(),
				output: z.object({
					echo: z.string(),
					sessionId: z.string(),
					threadId: z.string(),
					userId: z.string().nullable(),
				}),
			},
			handler: async (ctx, input) => {
				return {
					echo: input,
					sessionId: ctx.sessionId,
					threadId: ctx.thread.id,
					userId: ctx.auth?.user?.id ?? null,
				};
			},
		});

		const app = new Hono();

		app.use('*', async (c, next) => {
			await runInHTTPContext(c, next);
		});

		app.use('/api/*', async (c, next) => {
			const logger = createMockLogger();
			const thread = createMockThread(`thrd_${crypto.randomUUID()}`);
			const session = createMockSession(thread, `sess_${crypto.randomUUID()}`);
			const waitUntilHandler = new WaitUntilHandler(tracer);

			c.set('logger', logger);
			c.set('tracer', tracer);
			c.set('sessionId', session.id);
			c.set('thread', thread);
			c.set('session', session);
			c.set('waitUntilHandler', waitUntilHandler);
			c.set('agentIds', new Set<string>());
			c.set('trigger', 'websocket');
			c.set('app', {});
			await next();
		});

		app.use('/api/*', createAgentMiddleware(''));

		// This middleware runs after createAgentMiddleware('') and should still
		// be visible to the agent via the lazy ctx.auth getter.
		app.use('/api/*', async (c, next) => {
			c.set('auth', createMockAuth('late-bound-user'));
			await next();
		});

		app.get(
			'/api/echo',
			websocket((c, ws) => {
				ws.onOpen(() => {
					ws.send(JSON.stringify({ type: 'ready' }));
				});

				ws.onMessage(async (event) => {
					try {
						const result = await echoAgent.run(String(event.data));
						ws.send(
							JSON.stringify({
								type: 'echo',
								routeSessionId: c.var.sessionId,
								routeThreadId: c.var.thread.id,
								data: result,
							})
						);
					} catch (error) {
						ws.send(
							JSON.stringify({
								type: 'error',
								message: error instanceof Error ? error.message : String(error),
							})
						);
					}
				});
			})
		);

		const server = Bun.serve({
			port: 0,
			fetch: (request, server) => app.fetch(request, server),
			websocket: bunWebsocket,
		});

		const socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/echo`);

		try {
			await waitForOpen(socket);

			const ready = await waitForJsonMessage(socket);
			expect(ready).toEqual({ type: 'ready' });

			socket.send('hello from websocket test');

			const response = await waitForJsonMessage(socket);
			if (response.type !== 'echo') {
				throw new Error(`Expected echo response, received ${JSON.stringify(response)}`);
			}

			expect(response.data.echo).toBe('hello from websocket test');
			expect(response.data.sessionId).toBe(response.routeSessionId);
			expect(response.data.threadId).toBe(response.routeThreadId);
			expect(response.data.userId).toBe('late-bound-user');
			expect(response.data.sessionId.length).toBeGreaterThan(0);
			expect(response.data.threadId.length).toBeGreaterThan(0);
		} finally {
			await closeSocket(socket);
			server.stop(true);
		}
	});
});
