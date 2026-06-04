import { z } from 'zod';

/** Request payload for creating an email address */
export const CreateAddressRequestSchema = z.object({
	local_part: z.string().describe('Local part before `@agentuity.email`'),
});

/** Request payload for creating an email destination */
export const CreateEmailDestinationRequestSchema = z.object({
	type: z.string().describe('Destination type (`url`)'),
	config: z.record(z.string(), z.unknown()).describe('Destination config including URL'),
});

export type CreateAddressRequest = z.infer<typeof CreateAddressRequestSchema>;
export type CreateEmailDestinationRequest = z.infer<typeof CreateEmailDestinationRequestSchema>;
