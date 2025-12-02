import { z } from 'zod';
import type { Context, Handler } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { getAgents, createAgentMiddleware } from './agent';
import { createRouter } from './router';

export const createWorkbenchExecutionRoute = (): Handler => {
	console.log('🏗️ [Workbench] createWorkbenchExecutionRoute called - route handler created');
	const authHeader = process.env.AGENTUITY_WORKBENCH_APIKEY
		? `Bearer ${process.env.AGENTUITY_WORKBENCH_APIKEY}`
		: undefined;
	return async (ctx: Context) => {
		console.error('🚨 [Workbench] ROUTE HIT - execution route called');
		console.log('🚨 [Workbench] ROUTE HIT - execution route called');

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
			console.log('🚀 [Workbench] Starting execution route');

			let agentId: string;
			let input: unknown;
			try {
				const requestData = await ctx.req.json();
				agentId = requestData.agentId;
				input = requestData.input;
			} catch (error) {
				console.error('❌ [Workbench] JSON parse error:', error);
				return ctx.json({ error: 'Invalid JSON in request body' }, { status: 400 });
			}
			console.log('📝 [Workbench] Request data:', {
				agentId,
				inputType: typeof input,
				hasInput: input !== undefined,
			});

			// Get agents registry and find the agent
			const agents = getAgents();
			console.log('📋 [Workbench] Available agents:', Object.keys(agents).length);

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
				console.error('❌ [Workbench] Agent not found:', agentId);
				return ctx.text('Agent not found', { status: 404 });
			}

			console.log('✅ [Workbench] Found agent:', {
				name: agentName,
				hasInputSchema: !!agentObj.inputSchema,
			});

			// Validate input if schema exists
			let validatedInput = input;
			if (agentObj.inputSchema) {
				console.log('🔍 [Workbench] Validating input schema');
				const inputResult = await agentObj.inputSchema['~standard'].validate(input);
				if (inputResult.issues) {
					console.error('❌ [Workbench] Input validation failed:', inputResult.issues);
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
				console.error('❌ [Workbench] Agent runner not found in context for:', agentName);
				console.log('📋 [Workbench] Available runners:', Object.keys(ctx.var.agent || {}));
				return ctx.text('Agent runner not found', { status: 404 });
			}

			console.log('✅ [Workbench] Found agent runner, executing...');

			// Execute the agent
			let result;
			if (agentObj.inputSchema) {
				console.log('🔄 [Workbench] Running agent with input');
				result = await agentRunner.run(validatedInput);
			} else {
				console.log('🔄 [Workbench] Running agent without input');
				result = await agentRunner.run();
			}

			console.log('✅ [Workbench] Agent execution completed:', {
				resultType: typeof result,
				isNull: result === null,
				isUndefined: result === undefined,
			});

			// Handle cases where result might be undefined/null
			if (result === undefined || result === null) {
				console.log('ℹ️ [Workbench] Result is null/undefined, returning success wrapper');
				return ctx.json({ success: true, result: null });
			}

			console.log('📤 [Workbench] Returning result');
			return ctx.json(result);
		} catch (error) {
			console.error('💥 [Workbench] Execution error:', error);
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
	console.log('🏗️ [Workbench] createWorkbenchRouter called - creating router');
	const router = createRouter();

	// Apply agent middleware to ensure proper context is available
	console.log('🔧 [Workbench] Adding middleware to /_agentuity/workbench/*');
	router.use('/_agentuity/workbench/*', createAgentMiddleware(''));

	// Add workbench routes
	console.log('📡 [Workbench] Adding GET /_agentuity/workbench/metadata.json');
	router.get('/_agentuity/workbench/metadata.json', createWorkbenchMetadataRoute());
	console.log('📡 [Workbench] Adding POST /_agentuity/workbench/execute');
	router.post('/_agentuity/workbench/execute', createWorkbenchExecutionRoute());

	console.log('✅ [Workbench] Router created successfully');
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
			schemas.agents[agent.metadata.id] = {
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
