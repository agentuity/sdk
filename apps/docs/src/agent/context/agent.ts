/**
 * Context Agent
 *
 * Demonstrates the AgentContext (ctx) object available in every handler.
 * This is your agent's toolbox - it provides access to logging, storage,
 * state management, and observability features.
 *
 * Key properties shown:
 * - ctx.sessionId / ctx.thread.id - Request and conversation identifiers
 * - ctx.session.state - Per-request state (cleared after response)
 * - ctx.thread.state - Persistent state (survives across requests, 1hr TTL)
 * - ctx.kv / ctx.vector / ctx.objectstore - Storage services
 * - ctx.logger - Structured logging
 *
 * Docs: https://preview.agentuity.dev/v1/Reference/sdk-reference#context-api
 */
import { createAgent, getAgents } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { formatTimestamps } from '../../lib/utils';

const agent = createAgent('context', {
	description: 'Demonstrates AgentContext: sessions, threads, services, state, logging',
	schema: {
		input: s.enum(['session', 'services', 'agents', 'state']),
		output: s.object({
			type: s.string(),
			data: s.unknown(),
		}),
	},
	handler: async (ctx, input) => {
		switch (input) {
			case 'session': {
				// Set demo values to show session state works (resets each request)
				ctx.session.state.set('requestTimestamp', new Date().toISOString());
				ctx.session.state.set('note', 'This resets each request');

				const threadEntries = await ctx.thread.state.entries();
				return {
					type: 'Session Information',
					data: {
						sessionId: ctx.sessionId,
						threadId: ctx.thread.id,
						sessionState: formatTimestamps(Object.fromEntries(ctx.session.state)),
						threadState: formatTimestamps(Object.fromEntries(threadEntries)),
					},
				};
			}

			case 'services':
				return {
					type: 'Available Services',
					data: {
						keyValue: typeof ctx.kv !== 'undefined',
						vector: typeof ctx.vector !== 'undefined',
						stream: typeof ctx.stream !== 'undefined',
						logger: typeof ctx.logger !== 'undefined',
						tracer: typeof ctx.tracer !== 'undefined',
					},
				};

			case 'agents': {
				const agentsMap = getAgents();
				const agentList = Array.from(agentsMap.entries()).map(([name, agentDef]) => ({
					name,
					description: agentDef.metadata?.description || '',
				}));

				return {
					type: 'Agent Registry',
					data: {
						count: agentList.length,
						agents: agentList,
						note: 'Import agents via: import agent from "@agent/name"; agent.run(input)',
					},
				};
			}

			case 'state': {
				// Thread state persists across multiple requests (cookie-based)
				const threadVisits = ((await ctx.thread.state.get('threadVisits')) as number) || 0;
				await ctx.thread.state.set('threadVisits', threadVisits + 1);

				return {
					type: 'State Management',
					data: {
						threadVisits: threadVisits + 1,
						note: 'Thread state persists across multiple requests (cookie-based). Session state exists only for the current request.',
					},
				};
			}

			default:
				return {
					type: 'Unknown',
					data: null,
				};
		}
	},
});

export default agent;
