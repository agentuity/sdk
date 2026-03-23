import type { Context, Handler, MiddlewareHandler } from 'hono';
import { toJSONSchema } from '@agentuity/server';
import { getAgents, createAgentMiddleware } from './agent';
import { createRouter } from './router';
import { websocket, type WebSocketConnection } from './handlers/websocket';
import { privateContext } from './_server';
import { getThreadProvider } from './_services';
import {
	loadBuildMetadata,
	getAgentMetadataByAgentId,
	hasMetadata,
	ensureAgentsImported,
} from './_metadata';
import { TOKENS_HEADER, DURATION_HEADER } from './_tokens';
import { verifySignature } from './signature';
import { isProduction } from './_config';
import { createCorsMiddleware } from './middleware';

/**
 * Trusted Agentuity domain suffixes for workbench CORS.
 * Any origin matching https://*.{suffix} is allowed.
 * In development, any origin is allowed.
 */
const TRUSTED_WORKBENCH_DOMAIN_SUFFIXES = ['.agentuity.com', '.agentuity.dev', '.agentuity.io'];

/**
 * Check if an origin is a trusted Agentuity app origin.
 * Matches any HTTPS subdomain of the trusted domain suffixes.
 */
function isTrustedWorkbenchOrigin(origin: string): boolean {
	try {
		const url = new URL(origin);
		if (url.protocol !== 'https:') return false;
		return TRUSTED_WORKBENCH_DOMAIN_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
	} catch {
		return false;
	}
}

/**
 * Middleware that verifies workbench request signatures in production.
 * In development mode, all requests are allowed.
 * Supports both header-based auth (for HTTP) and query param auth (for WebSocket).
 */
const createWorkbenchAuthMiddleware = (): MiddlewareHandler => {
	return async (c, next) => {
		// Allow CORS preflight requests through (they don't have auth headers)
		if (c.req.method === 'OPTIONS') {
			return next();
		}

		// Skip auth in dev mode
		if (!isProduction()) {
			return next();
		}

		// Check signature from headers or query params (for WebSocket)
		const signature = c.req.header('X-Agentuity-Workbench-Signature') || c.req.query('signature');
		const timestamp = c.req.header('X-Agentuity-Workbench-Timestamp') || c.req.query('timestamp');

		// For non-POST requests, body is empty
		let body = '';
		if (c.req.method === 'POST') {
			const clonedReq = c.req.raw.clone();
			body = await clonedReq.text();
		}

		const isValid = await verifySignature(signature, timestamp, body);
		if (!isValid) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		return next();
	};
};

/**
 * Middleware that captures execution metadata (tokens, duration, sessionId) after the handler completes
 * and saves it to thread state. Applied only to the /execute route.
 */
const createWorkbenchExecutionMetadataMiddleware = (): MiddlewareHandler => {
	return async (ctx, next) => {
		const started = performance.now();

		await next();

		// After handler completes, tokens and duration headers are available
		const thread = ctx.var.thread;
		if (!thread) {
			return;
		}

		// Get execution context set by the handler
		const executionCtx = (ctx as any).var.workbenchExecution as
			| { agentId: string; input: unknown; result: unknown }
			| undefined;
		if (!executionCtx) {
			return;
		}

		const { agentId, input, result } = executionCtx;
		const agentMessagesKey = `messages_${agentId}`;
		const maxMessages = 50;

		// Read tokens and duration from response headers
		const tokens = ctx.res.headers.get(TOKENS_HEADER) ?? undefined;
		const duration =
			ctx.res.headers.get(DURATION_HEADER) ??
			`${((performance.now() - started) / 1000).toFixed(1)}s`;
		const sessionId = ctx.var.sessionId;

		// Store input with metadata
		await thread.state.push(
			agentMessagesKey,
			{
				type: 'input',
				data: input,
				sessionId,
				timestamp: Date.now(),
			},
			maxMessages
		);

		// Store output with metadata (tokens, duration)
		if (result !== undefined && result !== null) {
			await thread.state.push(
				agentMessagesKey,
				{
					type: 'output',
					data: result,
					sessionId,
					tokens,
					duration,
					timestamp: Date.now(),
				},
				maxMessages
			);
		}

		// Save thread state
		try {
			const threadProvider = getThreadProvider();
			await threadProvider.save(thread);
		} catch {
			ctx.var.logger?.warn('Failed to save thread state');
		}
	};
};

export const createWorkbenchExecutionRoute = (): Handler => {
	return async (ctx: Context) => {
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
			let result: unknown;
			if (agentObj.inputSchema) {
				result = await (agentObj as any).handler(input);
			} else {
				result = await (agentObj as any).handler();
			}

			// Store execution context for the metadata middleware to save with tokens/duration
			(ctx as any).set('workbenchExecution', { agentId, input, result });

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
	return async (ctx: Context) => {
		const agentId = ctx.req.query('agentId');

		if (!agentId) {
			return ctx.json({ error: 'agentId query parameter is required' }, { status: 400 });
		}

		if (!ctx.var.thread) {
			return ctx.json({ error: 'Thread not available' }, { status: 404 });
		}

		// Clear state associated with this specific agent:
		// 1. messages_${agentId} - workbench message history
		// 2. Any keys starting with ${agentId}_ - agent-specific state
		const allKeys = await ctx.var.thread.state.keys();
		const agentPrefix = `${agentId}_`;
		const messagesKey = `messages_${agentId}`;

		for (const key of allKeys) {
			if (key === messagesKey || key.startsWith(agentPrefix)) {
				await ctx.var.thread.state.delete(key);
			}
		}

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
	return async (ctx: Context) => {
		const agentId = ctx.req.query('agentId');
		if (!agentId) {
			return ctx.json({ error: 'agentId query parameter is required' }, { status: 400 });
		}

		if (!ctx.var.thread) {
			return ctx.json({ error: 'Thread not available' }, { status: 404 });
		}

		const agentMessagesKey = `messages_${agentId}`;
		const messages = await ctx.var.thread.state.get(agentMessagesKey);

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
	const router = createRouter();

	// Apply CORS middleware first so that even error responses get CORS headers
	// In production, restrict origins to known Agentuity app domains + same-origin
	// In development, allow any origin for local testing flexibility
	router.use(
		'/_agentuity/workbench/*',
		createCorsMiddleware({
			origin: (origin: string, c) => {
				// In dev mode, allow any origin for local testing flexibility
				if (!isProduction()) {
					return origin;
				}
				// In production, allow any *.agentuity.{com,dev,io} origin
				if (isTrustedWorkbenchOrigin(origin)) {
					return origin;
				}
				// Allow same-origin requests (agent calling its own workbench)
				try {
					const requestOrigin = new URL(c.req.url).origin;
					if (origin === requestOrigin) {
						return origin;
					}
				} catch {
					// Invalid URL, reject
				}
				// Reject unknown origins — no Access-Control-Allow-Origin header
				return undefined;
			},
			allowHeaders: [
				'Content-Type',
				'Authorization',
				'Accept',
				'Origin',
				'X-Requested-With',
				'X-Agentuity-Workbench-Signature',
				'X-Agentuity-Workbench-Timestamp',
				'x-thread-id',
			],
			exposeHeaders: [
				'x-thread-id',
				'x-session-id',
				'x-agentuity-tokens',
				'x-agentuity-duration',
			],
		})
	);

	// Apply auth middleware (signature verification in production)
	router.use('/_agentuity/workbench/*', createWorkbenchAuthMiddleware());

	// Apply agent middleware to ensure proper context is available
	router.use('/_agentuity/workbench/*', createAgentMiddleware(''));

	// Add workbench routes
	router.get('/_agentuity/workbench/ws', websocket(createWorkbenchWebsocketHandler()));
	router.get('/_agentuity/workbench/metadata.json', createWorkbenchMetadataRoute());
	router.get('/_agentuity/workbench/sample', createWorkbenchSampleRoute());
	router.get('/_agentuity/workbench/state', createWorkbenchStateRoute());
	router.delete('/_agentuity/workbench/state', createWorkbenchClearStateRoute());
	router.post(
		'/_agentuity/workbench/execute',
		createWorkbenchExecutionMetadataMiddleware(),
		createWorkbenchExecutionRoute()
	);
	return router;
};

export const createWorkbenchSampleRoute = (): Handler => {
	return async (ctx: Context) => {
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
				(sdkKey ? 'https://catalyst.agentuity.cloud' : '');

			if (!sdkKey || !gatewayUrl) {
				return ctx.json(
					{
						error: 'AGENTUITY_SDK_KEY and gateway URL must be configured',
						message:
							'Set AGENTUITY_SDK_KEY and either AGENTUITY_AIGATEWAY_URL or AGENTUITY_TRANSPORT_URL',
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
	return async (ctx) => {
		// Read metadata from agentuity.metadata.json file
		const metadata = loadBuildMetadata();
		if (!metadata) {
			return ctx.json(
				{ error: 'Metadata file not found. Run build to generate metadata.' },
				{ status: 500 }
			);
		}

		try {
			// Ensure all agents are imported so their schemas are available
			await ensureAgentsImported();

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

export const createWorkbenchWebsocketHandler = () => {
	return (_c: Context, ws: WebSocketConnection) => {
		ws.onOpen(() => {
			workbenchWebSockets.add(ws);
			ws.send('alive');
		});

		ws.onMessage((event) => {
			const message = (event as MessageEvent).data;

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

/**
 * @deprecated Use createWorkbenchWebsocketHandler instead
 */
export const createWorkbenchWebsocketRoute = createWorkbenchWebsocketHandler;
