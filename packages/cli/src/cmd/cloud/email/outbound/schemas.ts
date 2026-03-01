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
	created_at: z.string().optional(),
	headers: z.record(z.string(), z.unknown()).optional(),
	attachments: z.array(z.unknown()).optional(),
});
