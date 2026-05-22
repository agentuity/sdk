import { describe, test, expect } from 'bun:test';
import app from '../src/index';

describe('standalone-backend', () => {
	test('GET / returns status', async () => {
		const res = await app.fetch(new Request('http://localhost/'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('ok');
		expect(body.timestamp).toBeDefined();
	});

	test('GET /health returns healthy', async () => {
		const res = await app.fetch(new Request('http://localhost/health'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.healthy).toBe(true);
		expect(typeof body.uptime).toBe('number');
	});

	test('POST /echo returns body', async () => {
		const res = await app.fetch(
			new Request('http://localhost/echo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'hello' }),
			})
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.echo.message).toBe('hello');
		expect(body.receivedAt).toBeDefined();
	});
});

describe.skip('deploy', () => {
	// These tests require the backend to support launch.json-based deployments.
	// Enable once the backend reads launch.json from the deployment bundle.

	test('agentuity build produces valid output', async () => {
		// TODO: Run `agentuity build`, verify launch.json, Procfile, .agentuity-build
	});

	test('agentuity deploy succeeds', async () => {
		// TODO: Deploy and verify the app is reachable
	});

	test('deployed app responds to health check', async () => {
		// TODO: Hit the deployed /health endpoint
	});
});
