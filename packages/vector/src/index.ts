export {
	VectorStorageService,
	VectorStorage,
	type VectorUpsertParams,
	type VectorUpsertBase,
	type VectorUpsertEmbeddings,
	type VectorUpsertText,
	type VectorUpsertResult,
	type VectorSearchParams,
	type VectorSearchResult,
	type VectorSearchResultWithDocument,
	type VectorResult,
	type VectorResultFound,
	type VectorResultNotFound,
	type VectorNamespaceStats,
	type VectorNamespaceStatsWithSamples,
	type VectorItemStats,
	type VectorGetAllStatsParams,
	type VectorStatsPaginated,
	type VectorSortField,
	VECTOR_MIN_TTL_SECONDS,
	VECTOR_MAX_TTL_SECONDS,
	VECTOR_DEFAULT_TTL_SECONDS,
	VectorUpsertBaseSchema,
	VectorUpsertEmbeddingsSchema,
	VectorUpsertTextSchema,
	VectorUpsertParamsSchema,
	VectorSearchParamsSchema,
	VectorSearchResultSchema,
	VectorSearchResultWithDocumentSchema,
	VectorUpsertResultSchema,
	VectorResultFoundSchema,
	VectorResultNotFoundSchema,
	VectorResultSchema,
	VectorNamespaceStatsSchema,
	VectorNamespaceStatsWithSamplesSchema,
	VectorItemStatsSchema,
	VectorGetAllStatsParamsSchema,
	VectorStatsPaginatedSchema,
	VectorSortFieldSchema,
} from '@agentuity/core/vector';

import {
	VectorStorageService,
	type VectorUpsertParams,
	type VectorSearchParams,
	type VectorResult,
	type VectorSearchResult,
	type VectorSearchResultWithDocument,
	type VectorUpsertResult,
} from '@agentuity/core/vector';
import { createServerFetchAdapter, type Logger } from '@agentuity/server';
import { createMinimalLogger } from '@agentuity/core';
import { getEnv } from '@agentuity/core';
import { getServiceUrls } from '@agentuity/core/config';
import { z } from 'zod';

export const VectorClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the Vector API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>().optional().describe('Custom logger instance'),
});
export type VectorClientOptions = z.infer<typeof VectorClientOptionsSchema>;

export class VectorClient {
	readonly #service: VectorStorageService;
	readonly #orgId?: string;

	constructor(options: VectorClientOptions = {}) {
		const apiKey = options.apiKey || getEnv('AGENTUITY_SDK_KEY') || getEnv('AGENTUITY_CLI_KEY');
		const region = getEnv('AGENTUITY_REGION') ?? 'usc';
		const serviceUrls = getServiceUrls(region);

		const url = options.url || getEnv('AGENTUITY_VECTOR_URL') || serviceUrls.vector;

		const logger = options.logger ?? createMinimalLogger();

		this.#orgId = options.orgId;

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
		this.#service = new VectorStorageService(url, adapter);
	}

	async upsert(name: string, ...documents: VectorUpsertParams[]): Promise<VectorUpsertResult[]> {
		return this.#service.upsert(name, ...documents);
	}

	async get<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		key: string
	): Promise<VectorResult<T>> {
		return this.#service.get(name, key);
	}

	async getMany<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		...keys: string[]
	): Promise<Map<string, VectorSearchResultWithDocument<T>>> {
		return this.#service.getMany(name, ...keys);
	}

	async search<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		params: VectorSearchParams<T>
	): Promise<VectorSearchResult<T>[]> {
		return this.#service.search(name, params);
	}

	async delete(name: string, ...keys: string[]): Promise<number> {
		return this.#service.delete(name, ...keys);
	}

	async exists(name: string): Promise<boolean> {
		return this.#service.exists(name);
	}

	async getStats(name: string) {
		return this.#service.getStats(name);
	}

	async getAllStats(params?: Parameters<VectorStorageService['getAllStats']>[0]) {
		return this.#service.getAllStats(params);
	}

	async getNamespaces(): Promise<string[]> {
		return this.#service.getNamespaces();
	}

	async deleteNamespace(name: string): Promise<void> {
		return this.#service.deleteNamespace(name);
	}
}
