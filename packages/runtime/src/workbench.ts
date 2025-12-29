import type { Context, Handler } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { toJSONSchema } from '@agentuity/server';
import { getAgents, createAgentMiddleware } from './agent';
import { createRouter } from './router';
import type { WebSocketConnection } from './router';
import { privateContext } from './_server';
import { getThreadProvider } from './_services';
import { loadBuildMetadata, getAgentMetadataByAgentId, hasMetadata } from './_metadata';

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

		// Content-type validation
		const contentType = ctx.req.header('Content-Type');
		if (!contentType || !contentType.includes('application/json')) {
			return ctx.json({ error: 'Content-Type must be application/json' }, { status: 400 });
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

			// Read metadata to find agent name by agentId
			const agentMeta = getAgentMetadataByAgentId(agentId);
			if (!agentMeta) {
				if (!hasMetadata()) {
					return ctx.json({ error: 'Metadata file not found' }, { status: 500 });
				}
				return ctx.text('Agent not found', { status: 404 });
			}

			// Get runtime agent by name
			const allAgents = getAgents();
			const agentName = agentMeta.name;
			const agentObj = allAgents.get(agentName);

			if (!agentObj || !agentName) {
				return ctx.text('Agent not found', { status: 404 });
			}

			// Track agent ID for telemetry (otelMiddleware sets up agentIds)
			const _ctx = privateContext(ctx);
			if (agentObj.metadata?.id) {
				_ctx.var.agentIds.add(agentObj.metadata.id);
			}
			if (agentObj.metadata?.agentId) {
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

			// Store input and output in thread state, keyed by agentId
			// This allows multiple agents to have separate message histories in the same thread
			if (ctx.var.thread) {
				const agentMessagesKey = `messages_${agentId}`;
				const existingMessages = ctx.var.thread.state.get(agentMessagesKey);
				const messages = (existingMessages as unknown[] | undefined) || [];

				messages.push({ type: 'input', data: input });

				if (result !== undefined && result !== null) {
					messages.push({ type: 'output', data: result });
				}

				ctx.var.thread.state.set(agentMessagesKey, messages);

				// Manually save the thread to ensure state persists
				try {
					const threadProvider = getThreadProvider();
					await threadProvider.save(ctx.var.thread);
				} catch {
					ctx.var.logger?.warn('Failed to save thread state');
				}
			} else {
				ctx.var.logger?.warn('Thread not available in workbench execution route');
			}

			return ctx.json({ success: true, data: result ?? null });
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			// Return 200 with wrapped error so UI can display it properly
			return ctx.json({
				success: false,
				error: {
					message: err.message,
					stack: err.stack,
					code: 'code' in err && typeof err.code === 'string' ? err.code : 'EXECUTION_ERROR',
					cause: err.cause,
				},
			});
		}
	};
};

export const createWorkbenchClearStateRoute = (): Handler => {
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

		const agentId = ctx.req.query('agentId');

		if (!agentId) {
			return ctx.json({ error: 'agentId query parameter is required' }, { status: 400 });
		}

		if (!ctx.var.thread) {
			return ctx.json({ error: 'Thread not available' }, { status: 404 });
		}

		const agentMessagesKey = `messages_${agentId}`;

		// Remove the messages for this agent
		ctx.var.thread.state.delete(agentMessagesKey);

		// Save the thread to persist the cleared state
		try {
			const threadProvider = getThreadProvider();
			await threadProvider.save(ctx.var.thread);
		} catch {
			return ctx.json({ error: 'Failed to save thread state' }, { status: 500 });
		}

		return ctx.json({ success: true, message: `State cleared for agent ${agentId}` });
	};
};

export const createWorkbenchStateRoute = (): Handler => {
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

		const agentId = ctx.req.query('agentId');
		if (!agentId) {
			return ctx.json({ error: 'agentId query parameter is required' }, { status: 400 });
		}

		if (!ctx.var.thread) {
			return ctx.json({ error: 'Thread not available' }, { status: 404 });
		}

		const agentMessagesKey = `messages_${agentId}`;
		const messages = ctx.var.thread.state.get(agentMessagesKey);

		return ctx.json({
			threadId: ctx.var.thread.id,
			agentId,
			messages: Array.isArray(messages) ? messages : [],
		});
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
	router.get('/_agentuity/workbench/sample', createWorkbenchSampleRoute());
	router.get('/_agentuity/workbench/state', createWorkbenchStateRoute());
	router.delete('/_agentuity/workbench/state', createWorkbenchClearStateRoute());
	router.post('/_agentuity/workbench/execute', createWorkbenchExecutionRoute());
	return router;
};

export const createWorkbenchSampleRoute = (): Handler => {
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
				return ctx.text('Unauthorized', { status: 401 });
			}
		}

		try {
			const agentId = ctx.req.query('agentId');
			if (!agentId) {
				return ctx.json({ error: 'Missing agentId query parameter' }, { status: 400 });
			}

			// Read metadata to find agent name by agentId
			const agentMeta = getAgentMetadataByAgentId(agentId);
			if (!agentMeta) {
				if (!hasMetadata()) {
					return ctx.json({ error: 'Metadata file not found' }, { status: 500 });
				}
				return ctx.text('Agent not found', { status: 404 });
			}

			// Get runtime agent by name
			const allAgents = getAgents();
			const agentObj = allAgents.get(agentMeta.name);

			if (!agentObj) {
				return ctx.text('Agent not found', { status: 404 });
			}

			// Check if agent has input schema
			if (!agentObj.inputSchema) {
				return ctx.json({ error: 'Agent has no input schema' }, { status: 400 });
			}

			// Convert schema to JSON Schema
			const jsonSchema = toJSONSchema(agentObj.inputSchema);

			// Get Agentuity SDK key and gateway URL
			const sdkKey = process.env.AGENTUITY_SDK_KEY;
			const gatewayUrl =
				process.env.AGENTUITY_AIGATEWAY_URL ||
				process.env.AGENTUITY_TRANSPORT_URL ||
				(sdkKey ? 'https://agentuity.ai' : '');

			if (!sdkKey || !gatewayUrl) {
				return ctx.json(
					{
						error: 'AGENTUITY_SDK_KEY and gateway URL must be configured',
						message:
							'Set AGENTUITY_SDK_KEY and either AGENTUITY_AIGATEWAY_URL, AGENTUITY_TRANSPORT_URL, or use https://agentuity.ai',
					},
					{ status: 500 }
				);
			}

			// Generate sample using Groq via Agentuity Gateway
			const prompt = `Generate a realistic sample data object that matches this JSON schema. Return only valid JSON, no markdown code blocks or explanations.

JSON Schema:
${JSON.stringify(jsonSchema, null, 2)}

Return a JSON object that matches this schema with realistic values.`;

			const gatewayEndpoint = `${gatewayUrl}/gateway/groq/openai/v1/chat/completions`;
			const groqResponse = await fetch(gatewayEndpoint, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${sdkKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: 'llama-3.3-70b-versatile',
					messages: [
						{
							role: 'user',
							content: prompt,
						},
					],
				}),
			});

			if (!groqResponse.ok) {
				const errorText = await groqResponse.text();
				return ctx.json(
					{
						error: 'Groq API request failed',
						message: `Status ${groqResponse.status}: ${errorText}`,
					},
					{ status: 500 }
				);
			}

			const groqData = (await groqResponse.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};
			const text = groqData.choices?.[0]?.message?.content;
			if (!text) {
				return ctx.json(
					{ error: 'Invalid response from Groq API', response: groqData },
					{ status: 500 }
				);
			}

			// Parse the JSON response
			let sample: unknown;
			try {
				// Remove markdown code blocks if present
				const cleanedText = text
					.trim()
					.replace(/^```json\s*|\s*```$/g, '')
					.replace(/^```\s*|\s*```$/g, '');
				sample = JSON.parse(cleanedText);
			} catch (parseError) {
				return ctx.json(
					{
						error: 'Failed to parse generated JSON',
						message: parseError instanceof Error ? parseError.message : String(parseError),
						generatedText: text,
					},
					{ status: 500 }
				);
			}

			return ctx.json(sample);
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

export const createWorkbenchMetadataRoute = (): Handler => {
	const authHeader = process.env.AGENTUITY_WORKBENCH_APIKEY
		? `Bearer ${process.env.AGENTUITY_WORKBENCH_APIKEY}`
		: undefined;

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

		// Read metadata from agentuity.metadata.json file
		const metadata = loadBuildMetadata();
		if (!metadata) {
			return ctx.json(
				{ error: 'Metadata file not found. Run build to generate metadata.' },
				{ status: 500 }
			);
		}

		try {
			// Get runtime agents for JSON schema generation
			const agents = getAgents();
			const agentsByName = new Map();
			for (const [name, agent] of agents) {
				agentsByName.set(name, agent);
			}

			// Transform metadata structure to workbench format
			const schemas: { agents: Record<string, unknown> } = { agents: {} };

			for (const agent of metadata.agents || []) {
				// Try to find runtime agent by name to get JSON schemas
				const runtimeAgent = agentsByName.get(agent.name);

				schemas.agents[agent.id] = {
					schema: {
						input: agent.schema?.input
							? {
									code: agent.schema.input,
									json: runtimeAgent?.inputSchema
										? toJSONSchema(runtimeAgent.inputSchema)
										: undefined,
								}
							: undefined,
						output: agent.schema?.output
							? {
									code: agent.schema.output,
									json: runtimeAgent?.outputSchema
										? toJSONSchema(runtimeAgent.outputSchema)
										: undefined,
								}
							: undefined,
					},
					examples: agent.examples,
					metadata: {
						id: agent.id,
						agentId: agent.agentId,
						name: agent.name,
						description: agent.description,
						filename: agent.filename,
						version: agent.version,
					},
				};
			}

			return ctx.json(schemas);
		} catch (error) {
			return ctx.json(
				{
					error: 'Failed to read metadata file',
					message: error instanceof Error ? error.message : String(error),
				},
				{ status: 500 }
			);
		}
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
