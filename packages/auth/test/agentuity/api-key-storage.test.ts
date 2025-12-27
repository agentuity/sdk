import { describe, test, expect } from 'bun:test';
import {
	createAgentuityApiKeyStorage,
	AGENTUITY_API_KEY_NAMESPACE,
} from '../../src/agentuity/api-key-storage';

describe('AGENTUITY_API_KEY_NAMESPACE', () => {
	test('has correct default value', () => {
		expect(AGENTUITY_API_KEY_NAMESPACE).toBe('_agentuity_auth_apikeys');
	});
});

describe('createAgentuityApiKeyStorage', () => {
	const createMockKv = () => {
		const store = new Map<string, unknown>();
		const namespaceCreated = { value: false };

		return {
			store,
			namespaceCreated,
			kv: {
				get: async (namespace: string, key: string) => {
					const fullKey = `${namespace}:${key}`;
					if (store.has(fullKey)) {
						return { exists: true, data: store.get(fullKey) };
					}
					return { exists: false };
				},
				set: async (
					namespace: string,
					key: string,
					value: unknown,
					_params?: { ttl?: number }
				) => {
					const fullKey = `${namespace}:${key}`;
					store.set(fullKey, value);
				},
				delete: async (namespace: string, key: string) => {
					const fullKey = `${namespace}:${key}`;
					store.delete(fullKey);
				},
				createNamespace: async (_namespace: string) => {
					namespaceCreated.value = true;
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any,
		};
	};

	test('get returns null when key does not exist', async () => {
		const { kv } = createMockKv();
		const storage = createAgentuityApiKeyStorage({ kv });

		const result = await storage.get('nonexistent-key');
		expect(result).toBeNull();
	});

	test('set and get work correctly', async () => {
		const { kv } = createMockKv();
		const storage = createAgentuityApiKeyStorage({ kv });

		await storage.set('test-key', 'test-value');
		const result = await storage.get('test-key');

		expect(result).toBe('test-value');
	});

	test('delete removes key', async () => {
		const { kv } = createMockKv();
		const storage = createAgentuityApiKeyStorage({ kv });

		await storage.set('test-key', 'test-value');
		await storage.delete('test-key');
		const result = await storage.get('test-key');

		expect(result).toBeNull();
	});

	test('uses default namespace', async () => {
		const { kv, store } = createMockKv();
		const storage = createAgentuityApiKeyStorage({ kv });

		await storage.set('my-key', 'my-value');

		// Check the store has the key with the default namespace
		expect(store.has(`${AGENTUITY_API_KEY_NAMESPACE}:my-key`)).toBe(true);
	});

	test('uses custom namespace when provided', async () => {
		const { kv, store } = createMockKv();
		const customNamespace = 'custom_api_keys';
		const storage = createAgentuityApiKeyStorage({ kv, namespace: customNamespace });

		await storage.set('my-key', 'my-value');

		expect(store.has(`${customNamespace}:my-key`)).toBe(true);
	});

	test('auto-creates namespace when autoCreateNamespace is true (default)', async () => {
		const { kv, namespaceCreated } = createMockKv();
		const storage = createAgentuityApiKeyStorage({ kv });

		await storage.get('any-key');

		expect(namespaceCreated.value).toBe(true);
	});

	test('does not auto-create namespace when autoCreateNamespace is false', async () => {
		const { kv, namespaceCreated } = createMockKv();
		const storage = createAgentuityApiKeyStorage({
			kv,
			autoCreateNamespace: false,
		});

		await storage.get('any-key');

		expect(namespaceCreated.value).toBe(false);
	});

	test('set with TTL passes TTL to KV (with minimum enforcement)', async () => {
		let capturedTtl: number | undefined;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const kv: any = {
			get: async () => ({ exists: false }),
			set: async (
				_namespace: string,
				_key: string,
				_value: unknown,
				params?: { ttl?: number }
			) => {
				capturedTtl = params?.ttl;
			},
			delete: async () => {},
			createNamespace: async () => {},
		};

		const storage = createAgentuityApiKeyStorage({ kv });

		// TTL below minimum (60000ms) should be raised to minimum
		await storage.set('key1', 'value1', 1000);
		expect(capturedTtl).toBe(60000); // Minimum TTL enforced

		// TTL above minimum should be passed through
		await storage.set('key2', 'value2', 120000);
		expect(capturedTtl).toBe(120000);
	});

	test('handles errors gracefully in get', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const kv: any = {
			get: async () => {
				throw new Error('Network error');
			},
			createNamespace: async () => {},
		};

		const storage = createAgentuityApiKeyStorage({ kv });
		const result = await storage.get('any-key');

		expect(result).toBeNull();
	});

	test('handles errors in delete without throwing', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const kv: any = {
			get: async () => ({ exists: false }),
			delete: async () => {
				throw new Error('Delete failed');
			},
			createNamespace: async () => {},
		};

		const storage = createAgentuityApiKeyStorage({ kv });

		// Should not throw
		await storage.delete('any-key');
	});
});
