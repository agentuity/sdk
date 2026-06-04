export {
	StreamStorageService,
	StreamStorage,
	Stream,
	type CreateStreamProps,
	type ListStreamsParams,
	type ListStreamsResponse,
	type StreamInfo,
	type StreamSortField,
	STREAM_MIN_TTL_SECONDS,
	STREAM_MAX_TTL_SECONDS,
	STREAM_DEFAULT_TTL_SECONDS,
	CreateStreamPropsSchema,
	ListStreamsParamsSchema,
	ListStreamsResponseSchema,
	StreamInfoSchema,
	StreamSortFieldSchema,
} from '@agentuity/core/stream';

import {
	StreamStorageService,
	type CreateStreamProps,
	type ListStreamsParams,
	type ListStreamsResponse,
	type StreamInfo,
	type Stream,
} from '@agentuity/core/stream';
import { getServiceUrls } from '@agentuity/config';
import {
	createServiceAdapter,
	isLogger,
	resolveApiKey,
	resolveRegion,
	resolveServiceUrl,
	type Logger,
} from '@agentuity/client';
import { z } from 'zod';

export const StreamClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the Stream API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>(isLogger).optional().describe('Custom logger instance'),
});
export type StreamClientOptions = z.infer<typeof StreamClientOptionsSchema>;

export class StreamClient {
	readonly #service: StreamStorageService;

	constructor(options: StreamClientOptions = {}) {
		const validatedOptions = StreamClientOptionsSchema.parse(options);
		const serviceUrls = getServiceUrls(resolveRegion());
		const url = resolveServiceUrl({
			url: validatedOptions.url,
			envKey: 'AGENTUITY_STREAM_URL',
			fallback: serviceUrls.stream,
		});
		const { adapter } = createServiceAdapter({
			apiKey: resolveApiKey(validatedOptions.apiKey),
			orgId: validatedOptions.orgId,
			logger: validatedOptions.logger,
		});
		this.#service = new StreamStorageService(url, adapter);
	}

	/**
	 * Create a new stream for writing data that can be read multiple times
	 */
	async create(namespace: string, props?: CreateStreamProps): Promise<Stream> {
		return this.#service.create(namespace, props);
	}

	/**
	 * Get stream metadata by ID
	 */
	async get(id: string): Promise<StreamInfo> {
		return this.#service.get(id);
	}

	/**
	 * Download stream content
	 */
	async download(id: string): Promise<ReadableStream<Uint8Array>> {
		return this.#service.download(id);
	}

	/**
	 * List streams with optional filtering and pagination
	 */
	async list(params?: ListStreamsParams): Promise<ListStreamsResponse> {
		return this.#service.list(params);
	}

	/**
	 * Delete a stream by its ID
	 */
	async delete(id: string): Promise<void> {
		return this.#service.delete(id);
	}
}
