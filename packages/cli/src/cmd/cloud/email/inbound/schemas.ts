import { z } from 'zod';

export const EmailInboundSchema = z.object({
	id: z.string(),
	from: z.string(),
	to: z.string(),
	subject: z.string().optional(),
	text: z.string().optional(),
	html: z.string().optional(),
	received_at: z.string().optional(),
	headers: z.record(z.string(), z.unknown()).optional(),
	attachments: z.array(z.unknown()).optional(),
});
