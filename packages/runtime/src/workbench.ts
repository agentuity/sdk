import { z } from 'zod';
import type { Handler } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { getAgents } from './agent';

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
			schemas.agents[agent.metadata.name] = {
				schema: {
					input: agent.inputSchema ? z.toJSONSchema(agent.inputSchema) : undefined,
					output: agent.outputSchema ? z.toJSONSchema(agent.outputSchema) : undefined,
				},
				metadata: agent.metadata,
			};
		}
		return ctx.json(schemas);
	};
};
