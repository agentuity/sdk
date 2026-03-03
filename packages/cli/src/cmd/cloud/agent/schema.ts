import { z } from 'zod';
import type { Agent } from '@agentuity/server';

export const AgentSchema: z.ZodType<Agent> = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	identifier: z.string(),
	deploymentId: z.string().nullable(),
	devmode: z.boolean(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	evals: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			description: z.string().nullable(),
			identifier: z.string().nullable(),
			devmode: z.boolean(),
			createdAt: z.string(),
			updatedAt: z.string(),
		})
	),
});
