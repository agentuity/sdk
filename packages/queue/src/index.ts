export {
	QueueStorageService,
	QueueService,
	type QueuePublishParams,
	type QueuePublishResult,
	type QueueCreateParams,
	type QueueCreateResult,
	QueuePublishParamsSchema,
	QueuePublishResultSchema,
	QueueCreateParamsSchema,
	QueueCreateResultSchema,
	QueuePublishError,
	QueueNotFoundError,
	QueueValidationError,
} from '@agentuity/core/queue';

import {
	QueueStorageService,
	type QueuePublishParams,
	type QueuePublishResult,
	type QueueCreateParams,
	type QueueCreateResult,
} from '@agentuity/core/queue';
import { createServerFetchAdapter, type Logger } from '@agentuity/server';
import { createMinimalLogger, StructuredError } from '@agentuity/core';
import { getEnv } from '@agentuity/core';
import { getServiceUrls } from '@agentuity/core/config';
import { z, ZodError } from 'zod';

const isLogger = (val: unknown): val is Logger =>
	typeof val === 'object' &&
	val !== null &&
	['info', 'warn', 'error', 'debug', 'trace'].every(
		(m) => typeof (val as Record<string, unknown>)[m] === 'function'
	);

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
		const apiKey =
			validatedOptions.apiKey || getEnv('AGENTUITY_SDK_KEY') || getEnv('AGENTUITY_CLI_KEY');
		const region = getEnv('AGENTUITY_REGION') ?? 'usc';
		const serviceUrls = getServiceUrls(region);

		const url = validatedOptions.url || getEnv('AGENTUITY_QUEUE_URL') || serviceUrls.catalyst;

		const logger = validatedOptions.logger ?? createMinimalLogger();

		const headers: Record<string, string> = apiKey
			? {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				}
			: { 'Content-Type': 'application/json' };

		if (validatedOptions.orgId) {
			headers['x-agentuity-orgid'] = validatedOptions.orgId;
		}

		const adapter = createServerFetchAdapter({ headers }, logger);
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
