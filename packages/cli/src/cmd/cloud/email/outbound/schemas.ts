import { z } from 'zod';

export const EmailOutboundSchema = z.object({
	id: z.string(),
	from: z.string(),
	to: z.string(),
	subject: z.string().optional(),
	text: z.string().optional(),
	html: z.string().optional(),
	status: z.string().optional(),
	error: z.string().optional(),
	sent_at: z.string().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
});
