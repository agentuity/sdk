export {
	KeyValueStorageService,
	KeyValueStorage,
	type KeyValueStats,
	type KeyValueStatsPaginated,
	type KeyValueItemWithMetadata,
	type DataResult,
	type DataResultFound,
	type DataResultNotFound,
	type KeyValueStorageSetParams,
	type CreateNamespaceParams,
	type GetAllStatsParams,
	type KVSortField,
	KV_MIN_TTL_SECONDS,
	KV_MAX_TTL_SECONDS,
	KV_DEFAULT_TTL_SECONDS,
	DataResultFoundSchema,
	DataResultNotFoundSchema,
	DataResultSchema,
	KeyValueStorageSetParamsSchema,
	CreateNamespaceParamsSchema,
	GetAllStatsParamsSchema,
	KeyValueStatsSchema,
	KeyValueStatsPaginatedSchema,
	KeyValueItemWithMetadataSchema,
	KVSortFieldSchema,
} from '@agentuity/core/keyvalue';

import {
	KeyValueStorageService,
	type KeyValueStorageSetParams,
	type DataResult,
} from '@agentuity/core/keyvalue';
import { createServerFetchAdapter, type Logger } from '@agentuity/server';
import { createMinimalLogger } from '@agentuity/core';
import { getEnv } from '@agentuity/core';
import { getServiceUrls } from '@agentuity/core/config';
import { z } from 'zod';

export const KeyValueClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the KV API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>().optional().describe('Custom logger instance'),
});
export type KeyValueClientOptions = z.infer<typeof KeyValueClientOptionsSchema>;

export class KeyValueClient {
	readonly #service: KeyValueStorageService;

	constructor(options: KeyValueClientOptions = {}) {
		const apiKey = options.apiKey || getEnv('AGENTUITY_SDK_KEY') || getEnv('AGENTUITY_CLI_KEY');
		const region = getEnv('AGENTUITY_REGION') ?? 'usc';
		const serviceUrls = getServiceUrls(region);

		const url = options.url || getEnv('AGENTUITY_KEYVALUE_URL') || serviceUrls.keyvalue;

		const logger = options.logger ?? createMinimalLogger();

		const adapter = createServerFetchAdapter(
			{
				headers: apiKey
					? {
							Authorization: `Bearer ${apiKey}`,
							'Content-Type': 'application/json',
						}
					: { 'Content-Type': 'application/json' },
			},
			logger
		);
		this.#service = new KeyValueStorageService(url, adapter);
	}

	async get<T>(name: string, key: string): Promise<DataResult<T>> {
		return this.#service.get(name, key);
	}

	async set<T = unknown>(
		name: string,
		key: string,
		value: T,
		params?: KeyValueStorageSetParams
	): Promise<void> {
		return this.#service.set(name, key, value, params);
	}

	async delete(name: string, key: string): Promise<void> {
		return this.#service.delete(name, key);
	}

	async getStats(name: string) {
		return this.#service.getStats(name);
	}

	async getAllStats(params?: Parameters<KeyValueStorageService['getAllStats']>[0]) {
		return this.#service.getAllStats(params);
	}

	async getNamespaces(): Promise<string[]> {
		return this.#service.getNamespaces();
	}

	async search<T = unknown>(name: string, keyword: string) {
		return this.#service.search<T>(name, keyword);
	}

	async getKeys(name: string): Promise<string[]> {
		return this.#service.getKeys(name);
	}

	async deleteNamespace(name: string): Promise<void> {
		return this.#service.deleteNamespace(name);
	}

	async createNamespace(
		name: string,
		params?: Parameters<KeyValueStorageService['createNamespace']>[1]
	): Promise<void> {
		return this.#service.createNamespace(name, params);
	}
}
