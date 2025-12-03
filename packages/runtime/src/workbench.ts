import { z } from 'zod';
import type { Context, Handler } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { getAgents, createAgentMiddleware } from './agent';
import { createRouter } from './router';
import type { WebSocketConnection } from './router';

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
			const agents = getAgents();

			let agentObj;
			let agentName;

			for (const [name, agent] of agents) {
				if (agent.metadata.id === agentId) {
					agentObj = agent;
					agentName = name;
					break;
				}
			}

			if (!agentObj || !agentName) {
				return ctx.text('Agent not found', { status: 404 });
			}

			// Validate input if schema exists
			let validatedInput = input;
			if (agentObj.inputSchema) {
				const inputResult = await agentObj.inputSchema['~standard'].validate(input);
				if (inputResult.issues) {
					return ctx.json(
						{
							error: 'Validation failed',
							issues: inputResult.issues,
						},
						{ status: 400 }
					);
				}
				validatedInput = inputResult.value;
				console.log('✅ [Workbench] Input validation passed');
			} else {
				console.log('ℹ️ [Workbench] No input schema, skipping validation');
			}

			// Get agent runner from context.var.agent (should be available via middleware)
			const agentRunner = ctx.var.agent[agentName];
			if (!agentRunner) {
				return ctx.text('Agent runner not found', { status: 404 });
			}

			// Execute the agent
			let result;
			if (agentObj.inputSchema) {
				result = await agentRunner.run(validatedInput);
			} else {
				result = await agentRunner.run();
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
		// TODO: this is going to only work for zod schema for now. need a way to handle others
		for (const [, agent] of agents) {
			schemas.agents[agent.metadata.identifier] = {
				schema: {
					input: agent.inputSchema
						? {
								code: agent.metadata.inputSchemaCode || undefined,
								json: z.toJSONSchema(agent.inputSchema),
							}
						: undefined,
					output: agent.outputSchema
						? {
								code: agent.metadata.outputSchemaCode || undefined,
								json: z.toJSONSchema(agent.outputSchema),
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
