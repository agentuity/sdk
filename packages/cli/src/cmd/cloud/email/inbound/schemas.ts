import { z } from 'zod';

export const EmailInboundSchema = z.object({
	id: z.string(),
	from: z.string(),
	to: z.string(),
	subject: z.string().optional(),
	text: z.string().optional(),
	status: z.string().optional(),
	received_at: z.string().optional(),
});
