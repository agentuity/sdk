import { describe, test, expect } from 'bun:test';
import app from '../src/server';

describe('e2e-web', () => {
	test('GET / returns HTML page', async () => {
		const res = await app.fetch(new Request('http://localhost/'));
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('E2E Test App');
		expect(body).toContain('echo-btn');
	});

	test('GET /api/health returns status', async () => {
		const res = await app.fetch(new Request('http://localhost/api/health'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('ok');
	});

	test('POST /api/echo returns body', async () => {
		const res = await app.fetch(
			new Request('http://localhost/api/echo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'test' }),
			})
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.echo.message).toBe('test');
	});

	test('GET /api/counter returns a number', async () => {
		const res = await app.fetch(new Request('http://localhost/api/counter'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(typeof body.count).toBe('number');
	});
});

describe.skip('deploy', () => {
	test('agentuity build produces valid output', async () => {
		// TODO: Verify launch.json, Procfile
	});

	test('agentuity deploy succeeds', async () => {
		// TODO: Deploy and verify
	});

	test('deployed app serves HTML and API', async () => {
		// TODO: Hit /, /api/health, /api/echo on deployed URL
	});
});
