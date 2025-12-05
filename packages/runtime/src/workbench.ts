import { z } from 'zod';
import type { Context, Handler } from 'hono';
import { s } from '@agentuity/schema';
import { timingSafeEqual } from 'node:crypto';
import { getAgents, createAgentMiddleware } from './agent';
import { createRouter } from './router';
import type { WebSocketConnection } from './router';
import { privateContext } from './_server';

export const createWorkbenchExecutionRoute = (): Handler => {
	const authHeader = process.env.AGENTUITY_WORKBENCH_APIKEY
		? `Bearer ${process.env.AGENTUITY_WORKBENCH_APIKEY}`
		: undefined;
	return async (ctx: Context) => {
		// Authentication check
		if (authHeader) {
			try {
				const authValue = ctx.req.header('Authorization');
				if (
					!authValue ||
					!timingSafeEqual(Buffer.from(authValue, 'utf-8'), Buffer.from(authHeader, 'utf-8'))
				) {
					return ctx.text('Unauthorized', { status: 401 });
				}
			} catch {
				// timing safe equals will throw if the input/output lengths are mismatched
				// so we treat all exceptions as invalid
				return ctx.text('Unauthorized', { status: 401 });
			}
		}

		try {
			let agentId: string;
			let input: unknown;
			try {
				const requestData = await ctx.req.json();
				agentId = requestData.agentId;
				input = requestData.input;
			} catch (_error) {
				return ctx.json({ error: 'Invalid JSON in request body' }, { status: 400 });
			}

			// Get agents registry and find the agent
			const allAgents = getAgents();

			let agentObj;
			let agentName;

			for (const [name, agent] of allAgents) {
				if (agent.metadata.id === agentId) {
					agentObj = agent;
					agentName = name;
					break;
				}
			}

			if (!agentObj || !agentName) {
				return ctx.text('Agent not found', { status: 404 });
			}

			// Track agent ID for telemetry (otelMiddleware sets up agentIds)
			const _ctx = privateContext(ctx);
			if (agentObj.metadata?.id) {
				_ctx.var.agentIds.add(agentObj.metadata.id);
				_ctx.var.agentIds.add(agentObj.metadata.agentId);
			}

			// Execute the agent handler directly
			// The agentMiddleware has already set up the AsyncLocalStorage context
			// so the handler can access it via getAgentContext()
			let result;
			if (agentObj.inputSchema) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				result = await (agentObj as any).handler(input);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				result = await (agentObj as any).handler();
			}

			// Handle cases where result might be undefined/null
			if (result === undefined || result === null) {
				return ctx.json({ success: true, result: null });
			}

			return ctx.json(result);
		} catch (error) {
			return ctx.json(
				{
					error: 'Internal server error',
					message: error instanceof Error ? error.message : String(error),
				},
				{ status: 500 }
			);
		}
	};
};

/**
 * Creates a workbench router with proper agent middleware for execution routes
 */
export const createWorkbenchRouter = () => {
	// Try to extract API key from inline workbench config if available
	try {
		// @ts-expect-error - AGENTUITY_WORKBENCH_CONFIG_INLINE will be replaced at build time
		if (typeof AGENTUITY_WORKBENCH_CONFIG_INLINE !== 'undefined') {
			// @ts-expect-error - AGENTUITY_WORKBENCH_CONFIG_INLINE will be replaced at build time
			const encoded = AGENTUITY_WORKBENCH_CONFIG_INLINE;

			// Decode the config manually to avoid async import
			const json = Buffer.from(encoded, 'base64').toString('utf-8');
			const config = JSON.parse(json);

			// Extract API key from Authorization header if present
			if (config.headers?.['Authorization']) {
				const authHeader = config.headers['Authorization'];
				if (authHeader.startsWith('Bearer ')) {
					const apiKey = authHeader.slice('Bearer '.length);
					process.env.AGENTUITY_WORKBENCH_APIKEY = apiKey;
				}
			}
		}
	} catch {
		// Silently ignore if config is not available or invalid
	}

	const router = createRouter();

	// Apply agent middleware to ensure proper context is available
	router.use('/_agentuity/workbench/*', createAgentMiddleware(''));

	// Add workbench routes
	router.websocket('/_agentuity/workbench/ws', createWorkbenchWebsocketRoute());
	router.get('/_agentuity/workbench/metadata.json', createWorkbenchMetadataRoute());
	router.post('/_agentuity/workbench/execute', createWorkbenchExecutionRoute());
	return router;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toJSONSchema = (schema: any) => {
	// Check if it's an Agentuity schema via StandardSchemaV1 vendor
	if (schema?.['~standard']?.vendor === 'agentuity') {
		return s.toJSONSchema(schema);
	}
	// Check if it's a Zod schema
	if (schema?._def?.typeName) {
		try {
			return z.toJSONSchema(schema);
		} catch {
			return {};
		}
	}
	// TODO: this is going to only work for zod schema for now. need a way to handle others
	// Unknown schema type
	return {};
};

export const createWorkbenchMetadataRoute = (): Handler => {
	const authHeader = process.env.AGENTUITY_WORKBENCH_APIKEY
		? `Bearer ${process.env.AGENTUITY_WORKBENCH_APIKEY}`
		: undefined;
	const agents = getAgents();
	return async (ctx) => {
		if (authHeader) {
			try {
				const authValue = ctx.req.header('Authorization');
				if (
					!authValue ||
					!timingSafeEqual(Buffer.from(authValue, 'utf-8'), Buffer.from(authHeader, 'utf-8'))
				) {
					return ctx.text('Unauthorized', { status: 401 });
				}
			} catch {
				// timing safe equals will throw if the input/output lengths are mismatched
				// so we treat all exceptions as invalid
				return ctx.text('Unauthorized', { status: 401 });
			}
		}
		const schemas: { agents: Record<string, unknown> } = { agents: {} };
		for (const [, agent] of agents) {
			schemas.agents[agent.metadata.id] = {
				schema: {
					input: agent.inputSchema
						? {
								code: agent.metadata.inputSchemaCode || undefined,
								json: toJSONSchema(agent.inputSchema),
							}
						: undefined,
					output: agent.outputSchema
						? {
								code: agent.metadata.outputSchemaCode || undefined,
								json: toJSONSchema(agent.outputSchema),
							}
						: undefined,
				},
				metadata: agent.metadata,
			};
		}
		return ctx.json(schemas);
	};
};

// Store WebSocket connections to notify them on app restart
const workbenchWebSockets = new Set<WebSocketConnection>();

export const createWorkbenchWebsocketRoute = () => {
	return (_ctx: Context) => {
		return (ws: WebSocketConnection) => {
			ws.onOpen(() => {
				workbenchWebSockets.add(ws);
				ws.send('alive');
			});

			ws.onMessage((event) => {
				const message = event.data;

				// If a client sends a message (CLI), broadcast to all other clients
				if (message === 'restarting' || message === 'alive') {
					// Broadcast the message to all other clients (excluding this CLI connection)
					for (const clientWs of workbenchWebSockets) {
						if (clientWs !== ws) {
							try {
								clientWs.send(message);
							} catch (_error) {
								workbenchWebSockets.delete(clientWs);
							}
						}
					}
				}
			});

			ws.onClose(() => {
				workbenchWebSockets.delete(ws);
			});
		};
	};
};
