import { describe, test, expect, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { PoolConfig } from '../src/types.ts';

class MockPool extends EventEmitter {
	static lastConfig: PoolConfig | undefined;
	lastQuery: { text: unknown; values?: unknown[] } | null = null;
	options: PoolConfig;
	totalCount = 0;
	idleCount = 0;
	waitingCount = 0;
	expiredCount = 0;
	ending = false;
	ended = false;

	constructor(config: PoolConfig) {
		super();
		this.options = config;
		MockPool.lastConfig = config;
	}

	async connect() {
		return {
			release: mock(() => {}),
		};
	}

	async query(text: unknown, values?: unknown[]) {
		this.lastQuery = { text, values };
		return {
			rows: [],
			rowCount: 0,
			command: 'SELECT',
			oid: 0,
			fields: [],
		};
	}

	async end() {
		this.ending = true;
		this.ended = true;
	}
}

mock.module('pg', () => ({
	default: { Pool: MockPool },
	Pool: MockPool,
}));

import { PostgresPool } from '../src/pool.ts';

describe('PostgresPool pg.Pool compatibility', () => {
	test('passes pg.PoolConfig options through to pg.Pool', async () => {
		const config: PoolConfig = {
			connectionString: 'postgres://localhost/test',
			min: 1,
			max: 5,
			allowExitOnIdle: true,
			maxUses: 3,
			maxLifetimeSeconds: 120,
			keepAlive: true,
			statement_timeout: 5000,
			query_timeout: 4000,
			application_name: 'compat-test',
			idle_in_transaction_session_timeout: 1500,
		};

		const pool = new PostgresPool(config);

		expect(MockPool.lastConfig).toMatchObject({
			connectionString: config.connectionString,
			min: 1,
			max: 5,
			allowExitOnIdle: true,
			maxUses: 3,
			maxLifetimeSeconds: 120,
			keepAlive: true,
			statement_timeout: 5000,
			query_timeout: 4000,
			application_name: 'compat-test',
			idle_in_transaction_session_timeout: 1500,
		});
		expect(pool.options.connectionString).toBe(config.connectionString);
		await pool.end();
	});

	test('exposes direct pool property getters', async () => {
		const pool = new PostgresPool({ connectionString: 'postgres://localhost/test' });
		const raw = pool.raw as unknown as MockPool;

		raw.totalCount = 3;
		raw.idleCount = 2;
		raw.waitingCount = 1;
		raw.expiredCount = 4;

		expect(pool.totalCount).toBe(3);
		expect(pool.idleCount).toBe(2);
		expect(pool.waitingCount).toBe(1);
		expect(pool.expiredCount).toBe(4);

		await pool.end();
	});

	test('forwards pg.Pool events', async () => {
		const pool = new PostgresPool({ connectionString: 'postgres://localhost/test' });
		const raw = pool.raw as unknown as MockPool;
		const client = { release: mock(() => {}) };
		const connectHandler = mock(() => {});
		const acquireHandler = mock(() => {});
		const releaseHandler = mock(() => {});
		const removeHandler = mock(() => {});
		const errorHandler = mock(() => {});
		const error = new Error('pool error');

		pool.on('connect', connectHandler);
		pool.on('acquire', acquireHandler);
		pool.on('release', releaseHandler);
		pool.on('remove', removeHandler);
		pool.on('error', errorHandler);

		raw.emit('connect', client);
		raw.emit('acquire', client);
		raw.emit('release', client);
		raw.emit('remove', client);
		raw.emit('error', error, client);

		expect(connectHandler).toHaveBeenCalledWith(client);
		expect(acquireHandler).toHaveBeenCalledWith(client);
		expect(releaseHandler).toHaveBeenCalledWith(client);
		expect(removeHandler).toHaveBeenCalledWith(client);
		expect(errorHandler).toHaveBeenCalledWith(error, client);

		await pool.end();
	});

	test('supports query callback overloads', async () => {
		const pool = new PostgresPool({ connectionString: 'postgres://localhost/test' });
		const raw = pool.raw as unknown as MockPool;

		await new Promise<void>((resolve) => {
			pool.query('SELECT 1', (err, result) => {
				expect(err).toBeNull();
				expect(result?.rows).toEqual([]);
				expect(raw.lastQuery?.text).toBe('SELECT 1');
				resolve();
			});
		});

		await new Promise<void>((resolve) => {
			pool.query('SELECT $1', [123], (err, result) => {
				expect(err).toBeNull();
				expect(result?.rows).toEqual([]);
				expect(raw.lastQuery?.values).toEqual([123]);
				resolve();
			});
		});

		await pool.end();
	});

	test('supports connect callback overloads', async () => {
		const pool = new PostgresPool({ connectionString: 'postgres://localhost/test' });

		await new Promise<void>((resolve) => {
			pool.connect((err, client, release) => {
				expect(err).toBeNull();
				expect(client).toBeDefined();
				expect(typeof release).toBe('function');
				resolve();
			});
		});

		await pool.end();
	});

	test('reports ending and ended states', async () => {
		const pool = new PostgresPool({ connectionString: 'postgres://localhost/test' });

		expect(pool.ending).toBe(false);
		expect(pool.ended).toBe(false);

		await pool.end();

		expect(pool.ending).toBe(true);
		expect(pool.ended).toBe(true);
	});
});
