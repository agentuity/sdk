import { describe, test, expect } from 'bun:test';
import type {
	PostgresConfig,
	ReconnectConfig,
	ConnectionStats,
	TLSConfig,
	TransactionOptions,
	ReserveOptions,
} from '../src/types.ts';

/**
 * Type-level tests for the postgres types.
 * These tests verify that the TypeScript types are correctly defined
 * and can be used as expected at compile time.
 *
 * Since these are interface types with no runtime behavior,
 * we test that objects conforming to the interfaces are valid.
 */

describe('type definitions', () => {
	describe('TLSConfig', () => {
		test('should accept valid TLS configuration', () => {
			const config: TLSConfig = {
				require: true,
				rejectUnauthorized: false,
			};
			expect(config.require).toBe(true);
			expect(config.rejectUnauthorized).toBe(false);
		});

		test('should accept "prefer" for require option', () => {
			const config: TLSConfig = {
				require: 'prefer',
			};
			expect(config.require).toBe('prefer');
		});

		test('should accept certificate options', () => {
			const config: TLSConfig = {
				ca: '-----BEGIN CERTIFICATE-----\n...',
				cert: '-----BEGIN CERTIFICATE-----\n...',
				key: '-----BEGIN PRIVATE KEY-----\n...',
			};
			expect(config.ca).toBeDefined();
			expect(config.cert).toBeDefined();
			expect(config.key).toBeDefined();
		});

		test('should accept Buffer for certificate options', () => {
			const config: TLSConfig = {
				ca: Buffer.from('cert'),
				cert: Buffer.from('cert'),
				key: Buffer.from('key'),
			};
			expect(config.ca).toBeInstanceOf(Buffer);
		});

		test('should accept array of certificates for ca', () => {
			const config: TLSConfig = {
				ca: ['cert1', Buffer.from('cert2')],
			};
			expect(Array.isArray(config.ca)).toBe(true);
		});

		test('should accept empty config', () => {
			const config: TLSConfig = {};
			expect(config).toEqual({});
		});
	});

	describe('ReconnectConfig', () => {
		test('should accept valid reconnect configuration', () => {
			const config: ReconnectConfig = {
				maxAttempts: 5,
				initialDelayMs: 100,
				maxDelayMs: 30000,
				multiplier: 2,
				jitterMs: 1000,
				enabled: true,
			};
			expect(config.maxAttempts).toBe(5);
			expect(config.enabled).toBe(true);
		});

		test('should accept partial configuration', () => {
			const config: ReconnectConfig = {
				maxAttempts: 3,
			};
			expect(config.maxAttempts).toBe(3);
			expect(config.initialDelayMs).toBeUndefined();
		});

		test('should accept empty config', () => {
			const config: ReconnectConfig = {};
			expect(config).toEqual({});
		});

		test('should accept disabled reconnection', () => {
			const config: ReconnectConfig = {
				enabled: false,
			};
			expect(config.enabled).toBe(false);
		});
	});

	describe('ConnectionStats', () => {
		test('should represent connected state', () => {
			const stats: ConnectionStats = {
				connected: true,
				reconnecting: false,
				totalConnections: 1,
				reconnectAttempts: 0,
				failedReconnects: 0,
				lastConnectedAt: new Date(),
				lastDisconnectedAt: null,
				lastReconnectAttemptAt: null,
			};
			expect(stats.connected).toBe(true);
			expect(stats.reconnecting).toBe(false);
		});

		test('should represent reconnecting state', () => {
			const stats: ConnectionStats = {
				connected: false,
				reconnecting: true,
				totalConnections: 5,
				reconnectAttempts: 3,
				failedReconnects: 2,
				lastConnectedAt: new Date('2024-01-01'),
				lastDisconnectedAt: new Date('2024-01-02'),
				lastReconnectAttemptAt: new Date(),
			};
			expect(stats.connected).toBe(false);
			expect(stats.reconnecting).toBe(true);
			expect(stats.reconnectAttempts).toBe(3);
		});

		test('should represent initial state with null dates', () => {
			const stats: ConnectionStats = {
				connected: false,
				reconnecting: false,
				totalConnections: 0,
				reconnectAttempts: 0,
				failedReconnects: 0,
				lastConnectedAt: null,
				lastDisconnectedAt: null,
				lastReconnectAttemptAt: null,
			};
			expect(stats.lastConnectedAt).toBeNull();
			expect(stats.lastDisconnectedAt).toBeNull();
		});
	});

	describe('PostgresConfig', () => {
		test('should accept URL-based configuration', () => {
			const config: PostgresConfig = {
				url: 'postgres://user:pass@localhost:5432/mydb',
			};
			expect(config.url).toBeDefined();
		});

		test('should accept host-based configuration', () => {
			const config: PostgresConfig = {
				hostname: 'localhost',
				port: 5432,
				username: 'user',
				password: 'pass',
				database: 'mydb',
			};
			expect(config.hostname).toBe('localhost');
			expect(config.port).toBe(5432);
		});

		test('should accept TLS configuration', () => {
			const config: PostgresConfig = {
				hostname: 'localhost',
				tls: {
					require: true,
					rejectUnauthorized: true,
				},
			};
			expect(config.tls).toBeDefined();
		});

		test('should accept boolean TLS configuration', () => {
			const config: PostgresConfig = {
				hostname: 'localhost',
				tls: true,
			};
			expect(config.tls).toBe(true);
		});

		test('should accept pool configuration', () => {
			const config: PostgresConfig = {
				hostname: 'localhost',
				max: 20,
				connectionTimeout: 10000,
				idleTimeout: 60000,
			};
			expect(config.max).toBe(20);
			expect(config.connectionTimeout).toBe(10000);
		});

		test('should accept reconnect configuration', () => {
			const config: PostgresConfig = {
				hostname: 'localhost',
				reconnect: {
					maxAttempts: 5,
					enabled: true,
				},
			};
			expect(config.reconnect?.maxAttempts).toBe(5);
		});

		test('should accept callback functions', () => {
			const onclose = (_error?: Error) => {};
			const onreconnect = (_attempt: number) => {};
			const onreconnected = () => {};
			const onreconnectfailed = (_error: Error) => {};

			const config: PostgresConfig = {
				hostname: 'localhost',
				onclose,
				onreconnect,
				onreconnected,
				onreconnectfailed,
			};

			expect(config.onclose).toBe(onclose);
			expect(config.onreconnect).toBe(onreconnect);
			expect(config.onreconnected).toBe(onreconnected);
			expect(config.onreconnectfailed).toBe(onreconnectfailed);
		});

		test('should accept empty config', () => {
			const config: PostgresConfig = {};
			expect(config).toEqual({});
		});
	});

	describe('TransactionOptions', () => {
		test('should accept isolation level', () => {
			const options: TransactionOptions = {
				isolationLevel: 'serializable',
			};
			expect(options.isolationLevel).toBe('serializable');
		});

		test('should accept all isolation levels', () => {
			const levels: TransactionOptions['isolationLevel'][] = [
				'read uncommitted',
				'read committed',
				'repeatable read',
				'serializable',
			];

			for (const level of levels) {
				const options: TransactionOptions = { isolationLevel: level };
				expect(options.isolationLevel).toBe(level);
			}
		});

		test('should accept readOnly option', () => {
			const options: TransactionOptions = {
				readOnly: true,
			};
			expect(options.readOnly).toBe(true);
		});

		test('should accept deferrable option', () => {
			const options: TransactionOptions = {
				isolationLevel: 'serializable',
				readOnly: true,
				deferrable: true,
			};
			expect(options.deferrable).toBe(true);
		});

		test('should accept empty options', () => {
			const options: TransactionOptions = {};
			expect(options).toEqual({});
		});
	});

	describe('ReserveOptions', () => {
		test('should accept timeout option', () => {
			const options: ReserveOptions = {
				timeout: 5000,
			};
			expect(options.timeout).toBe(5000);
		});

		test('should accept empty options', () => {
			const options: ReserveOptions = {};
			expect(options).toEqual({});
		});
	});
});
