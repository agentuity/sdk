export * from './service.ts';

import {
	QueueStorageService,
	type QueuePublishParams,
	type QueuePublishResult,
	type QueueCreateParams,
	type QueueCreateResult,
} from './service.ts';
import { StructuredError } from '@agentuity/adapter';
import { getServiceUrls } from '@agentuity/config';
import {
	createServiceAdapter,
	isLogger,
	resolveApiKey,
	resolveRegion,
	resolveServiceUrl,
	type Logger,
} from '@agentuity/client';
import { z, ZodError } from 'zod';

const QueueClientValidationError = StructuredError('QueueClientValidationError')<{
	schema: string;
	issues: Array<{ path: string; message: string }>;
}>();

export const QueueClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the Queue API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>(isLogger).optional().describe('Custom logger instance'),
});
export type QueueClientOptions = z.infer<typeof QueueClientOptionsSchema>;

export class QueueClient {
	readonly #service: QueueStorageService;

	constructor(options: QueueClientOptions = {}) {
		let validatedOptions: QueueClientOptions;
		try {
			validatedOptions = QueueClientOptionsSchema.parse(options);
		} catch (err) {
			if (err instanceof ZodError) {
				throw new QueueClientValidationError({
					message: 'Invalid QueueClient options',
					schema: 'QueueClientOptionsSchema',
					issues: err.issues.map((i) => ({
						path: i.path.join('.'),
						message: i.message,
					})),
					cause: err,
				});
			}
			throw err;
		}
		const apiKey = resolveApiKey(validatedOptions.apiKey);
		const serviceUrls = getServiceUrls(resolveRegion());
		const url = resolveServiceUrl({
			url: validatedOptions.url,
			envKey: 'AGENTUITY_QUEUE_URL',
			fallback: serviceUrls.catalyst,
		});
		const { adapter } = createServiceAdapter({
			apiKey,
			orgId: validatedOptions.orgId,
			logger: validatedOptions.logger,
		});
		this.#service = new QueueStorageService(url, adapter);
	}

	async publish(
		queueName: string,
		payload: string | object,
		params?: QueuePublishParams
	): Promise<QueuePublishResult> {
		return this.#service.publish(queueName, payload, params);
	}

	async createQueue(queueName: string, params?: QueueCreateParams): Promise<QueueCreateResult> {
		return this.#service.createQueue(queueName, params);
	}

	async deleteQueue(queueName: string): Promise<void> {
		return this.#service.deleteQueue(queueName);
	}
}
