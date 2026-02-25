import { z } from 'zod';

export const DestinationSchema = z.object({
	id: z.string(),
	type: z.string(),
	config: z.record(z.string(), z.unknown()).optional(),
	created_at: z.string(),
	updated_at: z.string().optional(),
});
