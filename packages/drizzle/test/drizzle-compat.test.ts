import { describe, it, expect } from 'bun:test';
import { drizzle } from '../src/index';
import { SQL } from '@agentuity/postgres';

const CONNECTION_URL = 'postgres://localhost:5432/nonexistent_db';

describe('drizzle compat', () => {
	it('accepts a connection string', () => {
		const db = drizzle(CONNECTION_URL);

		expect(db).toBeDefined();
		expect(db.$client).toBeDefined();
	});

	it('accepts a connection string with config', () => {
		const db = drizzle(CONNECTION_URL, { schema: {} });

		expect(db).toBeDefined();
		expect(db.$client).toBeDefined();
	});

	it('accepts a SQL instance', () => {
		const sql = new SQL(CONNECTION_URL);
		const db = drizzle(sql);

		expect(db).toBeDefined();
		expect(db.$client).toBeDefined();
	});

	it('accepts a SQL instance with config', () => {
		const sql = new SQL(CONNECTION_URL);
		const db = drizzle(sql, { schema: {} });

		expect(db).toBeDefined();
		expect(db.$client).toBeDefined();
	});

	it('accepts connection config object with string', () => {
		const db = drizzle({ connection: CONNECTION_URL });

		expect(db).toBeDefined();
		expect(db.$client).toBeDefined();
	});

	it('accepts connection config object with url', () => {
		const db = drizzle({ connection: { url: CONNECTION_URL } });

		expect(db).toBeDefined();
		expect(db.$client).toBeDefined();
	});

	it('accepts connection config object with client', () => {
		const sql = new SQL(CONNECTION_URL);
		const db = drizzle({ client: sql });

		expect(db).toBeDefined();
		expect(db.$client).toBeDefined();
	});

	it('provides drizzle.mock()', () => {
		const db = drizzle.mock();

		expect(db).toBeDefined();
		expect(db.$client).toBe('$client is not available on drizzle.mock()');
	});
});
