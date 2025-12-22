/**
 * Tests for thread and session metadata filtering via API.
 * Validates query parameter handling and type safety.
 */

import { test, expect, describe } from 'bun:test';
import { threadList, sessionList, APIClient } from '../src/api';
import { createMockLogger, mockFetch } from '@agentuity/test-utils';

describe('Session Metadata Filtering', () => {
	test('sessionList sends metadata filter as JSON query param', async () => {
		let capturedUrl: string | undefined;

		mockFetch(async (url) => {
			capturedUrl = url.toString();
			return new Response(JSON.stringify({ success: true, data: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		await sessionList(client, {
			count: 10,
			metadata: { userId: 'user123', department: 'sales' },
		});

		expect(capturedUrl).toBeDefined();
		expect(capturedUrl).toContain('metadata=');
		expect(capturedUrl).toContain(
			encodeURIComponent(JSON.stringify({ userId: 'user123', department: 'sales' }))
		);
	});

	test('sessionList omits metadata param when not provided', async () => {
		let capturedUrl: string | undefined;

		mockFetch(async (url) => {
			capturedUrl = url.toString();
			return new Response(JSON.stringify({ success: true, data: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		await sessionList(client, { count: 10 });

		expect(capturedUrl).toBeDefined();
		expect(capturedUrl).not.toContain('metadata=');
	});

	test('sessionList handles complex metadata filters', async () => {
		let capturedUrl: string | undefined;

		mockFetch(async (url) => {
			capturedUrl = url.toString();
			return new Response(JSON.stringify({ success: true, data: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		const complexMetadata = {
			userId: 'user123',
			tags: ['important', 'urgent'],
			config: { theme: 'dark' },
		};

		await sessionList(client, {
			count: 10,
			metadata: complexMetadata,
		});

		expect(capturedUrl).toBeDefined();
		expect(capturedUrl).toContain('metadata=');
		const decodedUrl = decodeURIComponent(capturedUrl!);
		expect(decodedUrl).toContain(JSON.stringify(complexMetadata));
	});

	test('sessionList response includes metadata in schema', async () => {
		mockFetch(async () => {
			return new Response(
				JSON.stringify({
					success: true,
					data: [
						{
							id: 'sess_123',
							created_at: '2025-01-01T00:00:00Z',
							updated_at: '2025-01-01T00:00:00Z',
							deleted: false,
							deleted_at: null,
							deleted_by: null,
							start_time: '2025-01-01T00:00:00Z',
							end_time: null,
							duration: null,
							org_id: 'org_123',
							project_id: 'proj_123',
							deployment_id: 'deploy_123',
							agent_ids: [],
							trigger: 'api',
							env: 'production',
							devmode: false,
							pending: false,
							success: true,
							error: null,
							metadata: { userId: 'user123' },
							cpu_time: null,
							llm_cost: null,
							llm_prompt_token_count: null,
							llm_completion_token_count: null,
							total_cost: null,
							method: 'POST',
							url: '/api/test',
							route_id: 'route_123',
							thread_id: 'thrd_123',
							timeline: null,
							user_data: null,
						},
					],
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json' },
				}
			);
		});

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		const result = await sessionList(client);

		expect(result).toHaveLength(1);
		expect(result[0].metadata).toEqual({ userId: 'user123' });
	});
});

describe('Thread Metadata Filtering', () => {
	test('threadList sends metadata filter as JSON query param', async () => {
		let capturedUrl: string | undefined;

		mockFetch(async (url) => {
			capturedUrl = url.toString();
			return new Response(JSON.stringify({ success: true, data: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		await threadList(client, {
			count: 10,
			metadata: { userId: 'user123', department: 'sales' },
		});

		expect(capturedUrl).toBeDefined();
		expect(capturedUrl).toContain('metadata=');
		expect(capturedUrl).toContain(
			encodeURIComponent(JSON.stringify({ userId: 'user123', department: 'sales' }))
		);
	});

	test('threadList omits metadata param when not provided', async () => {
		let capturedUrl: string | undefined;

		mockFetch(async (url) => {
			capturedUrl = url.toString();
			return new Response(JSON.stringify({ success: true, data: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		await threadList(client, { count: 10 });

		expect(capturedUrl).toBeDefined();
		expect(capturedUrl).not.toContain('metadata=');
	});

	test('threadList response includes metadata in schema', async () => {
		mockFetch(async () => {
			return new Response(
				JSON.stringify({
					success: true,
					data: [
						{
							id: 'thrd_123',
							created_at: '2025-01-01T00:00:00Z',
							updated_at: '2025-01-01T00:00:00Z',
							deleted: false,
							deleted_at: null,
							deleted_by: null,
							org_id: 'org_123',
							project_id: 'proj_123',
							user_data: null,
							metadata: { userId: 'user456', department: 'engineering' },
						},
					],
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json' },
				}
			);
		});

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		const result = await threadList(client);

		expect(result).toHaveLength(1);
		expect(result[0].metadata).toEqual({ userId: 'user456', department: 'engineering' });
	});
});

describe('Metadata Query Combinations', () => {
	test('sessionList combines metadata filter with other filters', async () => {
		let capturedUrl: string | undefined;

		mockFetch(async (url) => {
			capturedUrl = url.toString();
			return new Response(JSON.stringify({ success: true, data: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		await sessionList(client, {
			count: 20,
			projectId: 'proj_123',
			devmode: true,
			success: true,
			metadata: { userId: 'user123' },
		});

		expect(capturedUrl).toBeDefined();
		expect(capturedUrl).toContain('count=20');
		expect(capturedUrl).toContain('projectId=proj_123');
		expect(capturedUrl).toContain('devmode=true');
		expect(capturedUrl).toContain('success=true');
		expect(capturedUrl).toContain('metadata=');
	});

	test('threadList combines metadata filter with other filters', async () => {
		let capturedUrl: string | undefined;

		mockFetch(async (url) => {
			capturedUrl = url.toString();
			return new Response(JSON.stringify({ success: true, data: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		await threadList(client, {
			count: 15,
			projectId: 'proj_456',
			metadata: { department: 'sales' },
		});

		expect(capturedUrl).toBeDefined();
		expect(capturedUrl).toContain('count=15');
		expect(capturedUrl).toContain('projectId=proj_456');
		expect(capturedUrl).toContain('metadata=');
	});
});
