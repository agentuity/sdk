import { createPublicKey } from 'node:crypto';
import { APIResponseSchema } from '@agentuity/server';
import { z } from 'zod';
import { StructuredError } from '@agentuity/core';
import type { APIClient } from '../../api.ts';

const DevmodeRequestSchema = z.object({
	hostname: z.string().optional().describe('the hostname for the endpoint'),
	publicKey: z.string().optional().describe('the public key PEM for the endpoint'),
});

type DevmodeRequest = z.infer<typeof DevmodeRequestSchema>;

function extractPublicKeyPEM(privateKeyPEM: string): string | undefined {
	try {
		const publicKey = createPublicKey(privateKeyPEM);
		return publicKey.export({ type: 'spki', format: 'pem' }) as string;
	} catch {
		return undefined;
	}
}

const DevmodeResponseSchema = z.object({
	id: z.string(),
	hostname: z.string(),
	privateKey: z.string().optional(),
});
export type DevmodeResponse = z.infer<typeof DevmodeResponseSchema>;

const DevmodeResponseAPISchema = APIResponseSchema(DevmodeResponseSchema);
type DevmodeResponseAPI = z.infer<typeof DevmodeResponseAPISchema>;

const DevmodeEndpointError = StructuredError('DevmodeEndpointError');

/**
 * Reserve (or re-use) an Agentuity devmode endpoint for the current
 * project. The platform returns a hostname like
 * `<project>-<random>.devmode.agentuity.com` plus a private key the
 * gravity binary uses to authenticate when it dials the public-URL
 * tunnel. Re-passing a previously-issued private key keeps the same
 * hostname stable across dev sessions on the same machine.
 */
export async function generateEndpoint(
	apiClient: APIClient,
	projectId: string,
	hostname?: string,
	privateKey?: string
): Promise<DevmodeResponse> {
	const publicKey = privateKey ? extractPublicKeyPEM(privateKey) : undefined;

	const resp = await apiClient.request<DevmodeResponseAPI, DevmodeRequest>(
		'POST',
		`/cli/devmode/3/${projectId}`,
		DevmodeResponseAPISchema,
		{ hostname, publicKey },
		DevmodeRequestSchema
	);

	if (!resp.success) {
		throw new DevmodeEndpointError({ message: resp.message });
	}

	return resp.data;
}
