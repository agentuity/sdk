import { describe, test, expect } from 'bun:test';
import app from '../src/index';

describe('integration-suite', () => {
	test('GET / lists available services', async () => {
		const res = await app.fetch(new Request('http://localhost/'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.name).toBe('integration-suite');
		expect(body.services).toContain('keyvalue');
		expect(body.services).toContain('vector');
	});

	test('GET /api/health returns ok', async () => {
		const res = await app.fetch(new Request('http://localhost/api/health'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('ok');
	});
});

describe('api routes exist', () => {
	test('POST /api/kv/set', async () => {
		const res = await app.fetch(
			new Request('http://localhost/api/kv/set', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: 'test', value: 'hello' }),
			})
		);
		expect(res.status).toBe(200);
	});

	test('GET /api/kv/get/:key', async () => {
		const res = await app.fetch(new Request('http://localhost/api/kv/get/test'));
		expect(res.status).toBe(200);
	});

	test('POST /api/vector/upsert', async () => {
		const res = await app.fetch(
			new Request('http://localhost/api/vector/upsert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'doc1', text: 'hello world' }),
			})
		);
		expect(res.status).toBe(200);
	});

	test('POST /api/vector/search', async () => {
		const res = await app.fetch(
			new Request('http://localhost/api/vector/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: 'hello' }),
			})
		);
		expect(res.status).toBe(200);
	});

	test('POST /api/queue/publish', async () => {
		const res = await app.fetch(
			new Request('http://localhost/api/queue/publish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ topic: 'test', data: { foo: 'bar' } }),
			})
		);
		expect(res.status).toBe(200);
	});
});

describe.skip('services integration (requires AGENTUITY_SDK_KEY)', () => {
	// These tests require a deployed environment with real Agentuity services.
	// Enable once the backend supports launch.json-based deployments.

	test('keyvalue: set and get round-trip', async () => {
		// TODO: Set a key, get it back, verify value matches
	});

	test('vector: upsert and search', async () => {
		// TODO: Upsert a document, search for it, verify result
	});

	test('queue: publish and consume', async () => {
		// TODO: Publish a message, verify it was received
	});

	test('email: send test email', async () => {
		// TODO: Send via @agentuity/email, verify no error
	});

	test('schedule: create and list', async () => {
		// TODO: Create a schedule, list it back
	});

	test('task: create and poll', async () => {
		// TODO: Create a task, poll for completion
	});
});

describe.skip('deploy', () => {
	test('agentuity build produces valid output', async () => {
		// TODO: Verify launch.json
	});

	test('agentuity deploy succeeds', async () => {
		// TODO: Deploy and verify
	});

	test('deployed app health check passes', async () => {
		// TODO: Hit /api/health on deployed URL
	});
});
