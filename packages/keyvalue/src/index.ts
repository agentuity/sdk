export * from './service.ts';
export * from './types.ts';

import {
	KeyValueStorageService,
	type KeyValueStorageSetParams,
	type DataResult,
} from './service.ts';
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

export const KeyValueClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the KV API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>(isLogger).optional().describe('Custom logger instance'),
});
export type KeyValueClientOptions = z.infer<typeof KeyValueClientOptionsSchema>;

export class KeyValueClient {
	readonly #service: KeyValueStorageService;

	constructor(options: KeyValueClientOptions = {}) {
		const validatedOptions = KeyValueClientOptionsSchema.parse(options);
		const serviceUrls = getServiceUrls(resolveRegion());

		const url = resolveServiceUrl({
			url: validatedOptions.url,
			envKey: 'AGENTUITY_KEYVALUE_URL',
			fallback: serviceUrls.keyvalue,
		});

		const { adapter } = createServiceAdapter({
			apiKey: resolveApiKey(validatedOptions.apiKey),
			orgId: validatedOptions.orgId,
			logger: validatedOptions.logger,
		});
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
