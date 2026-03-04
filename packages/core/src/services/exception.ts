import { StructuredError } from '../error.ts';
import { HttpMethodSchema } from './adapter.ts';
import { z } from 'zod';

export const ServiceExceptionPayloadSchema = z
	.object({
		statusCode: z.number().describe('HTTP status code returned by the service.'),
		method: HttpMethodSchema.describe('HTTP method used in the request.'),
		url: z.string().describe('URL of the failed request.'),
		sessionId: z
			.string()
			.optional()
			.nullable()
			.describe('Session ID associated with the request, if any.'),
	})
	.describe('Payload for service exception errors.');

export type ServiceExceptionPayload = z.infer<typeof ServiceExceptionPayloadSchema>;

export const ServiceException = StructuredError('ServiceException')<ServiceExceptionPayload>();
