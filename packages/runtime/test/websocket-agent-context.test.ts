import { describe, expect, test } from 'bun:test';
import type { AuthInterface } from '@agentuity/auth/types';
import { Hono } from 'hono';
import { createAgent } from '../src/agent';
import { createApp, type Env } from '../src/app';
import { websocket } from '../src/handlers/websocket';
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

function waitForOpen(socket: WebSocket): Promise<void> {
	return new Promise((resolve, reject) => {
		const onOpen = () => {
			socket.removeEventListener('error', onError);
			resolve();
		};
		const onError = () => {
			socket.removeEventListener('open', onOpen);
			reject(new Error('WebSocket failed to open'));
		};

		socket.addEventListener('open', onOpen, { once: true });
		socket.addEventListener('error', onError, { once: true });
	});
}

function waitForJsonMessage(socket: WebSocket): Promise<SocketMessage> {
	return new Promise((resolve, reject) => {
		const onMessage = (event: MessageEvent) => {
			socket.removeEventListener('error', onError);
			try {
				resolve(JSON.parse(String(event.data)) as SocketMessage);
			} catch (error) {
				reject(error);
			}
		};
		const onError = () => {
			socket.removeEventListener('message', onMessage);
			reject(new Error('WebSocket errored while waiting for a message'));
		};

		socket.addEventListener('message', onMessage, { once: true });
		socket.addEventListener('error', onError, { once: true });
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
		const originalNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'development';

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

		const router = new Hono<Env>();

		// This middleware runs after createAgentMiddleware('') and should still
		// be visible to the agent via the lazy ctx.auth getter.
		router.use('*', async (c, next) => {
			c.set('auth', createMockAuth('late-bound-user'));
			await next();
		});

		router.get(
			'/echo',
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

		try {
			// createApp only exposes fetch/websocket in development mode, which this
			// test needs in order to start a real Bun WebSocket server.
			const app = await createApp({
				analytics: false,
				workbench: false,
				services: { useLocal: true },
				router: { path: '/api', router },
				agents: [echoAgent],
			});

			const server = Bun.serve({
				port: 0,
				fetch: app.fetch,
				websocket: app.websocket,
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
		} finally {
			if (originalNodeEnv === undefined) {
				delete process.env.NODE_ENV;
			} else {
				process.env.NODE_ENV = originalNodeEnv;
			}
		}
	});
});
