import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { StreamResponseError } from './util';

const StreamDetailSchema = z.object({
	id: z.string().describe('the stream id'),
	namespace: z.string().describe('the stream namespace'),
	metadata: z.record(z.string(), z.string()).describe('stream metadata'),
	url: z.string().describe('public URL to access the stream'),
	sizeBytes: z.number().describe('size in bytes'),
	createdAt: z.string().nullable().describe('ISO 8601 creation timestamp'),
	updatedAt: z.string().nullable().describe('ISO 8601 last update timestamp'),
	startedAt: z.string().nullable().describe('ISO 8601 stream start timestamp'),
	endedAt: z.string().nullable().describe('ISO 8601 stream end timestamp'),
	expiresAt: z.string().nullable().describe('ISO 8601 expiration timestamp or null'),
	orgId: z.string().describe('the organization id'),
	projectId: z.string().nullable().describe('the project id'),
	completed: z.boolean().describe('whether the stream upload is completed'),
	headers: z.record(z.string(), z.string()).describe('stream headers'),
	chunks: z.number().describe('number of chunks'),
});

const StreamDetailResponseSchema = APIResponseSchema(StreamDetailSchema);

export type StreamDetailResponse = z.infer<typeof StreamDetailResponseSchema>;
export type StreamDetail = z.infer<typeof StreamDetailSchema>;

/**
 * Get a specific stream by ID.
 *
 * @param client - The API client
 * @param id - The stream ID
 * @returns A promise that resolves to the stream details
 *
 * @example
 * const stream = await streamGet(client, 'stream_abc123');
 * console.log(`Namespace: ${stream.namespace}, Size: ${stream.sizeBytes} bytes`);
 */
export async function streamGet(client: APIClient, id: string): Promise<StreamDetail> {
	const resp = await client.request<StreamDetailResponse>(
		'GET',
		`/cli/stream/${encodeURIComponent(id)}`,
		StreamDetailResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new StreamResponseError({ message: resp.message });
}
