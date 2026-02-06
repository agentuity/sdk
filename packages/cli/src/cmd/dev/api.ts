import { APIResponseSchema } from '@agentuity/server';
import { z } from 'zod';
import type { APIClient } from '../../api';
import { StructuredError } from '@agentuity/core';
import { createPublicKey } from 'crypto';

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
 * Generate an Endpoint ID and Hostname
 *
 * @param apiClient the api client to use
 * @param projectId the project id
 * @param hostname the hostname is already configured
 * @param privateKey the private key PEM if already configured
 * @returns
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
