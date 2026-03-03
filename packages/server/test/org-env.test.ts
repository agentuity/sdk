import { describe, test, expect } from 'bun:test';
import { APIClient } from '../src/api/api.ts';
import { orgEnvGet } from '../src/api/org/env-get.ts';
import { orgEnvUpdate } from '../src/api/org/env-update.ts';
import { orgEnvDelete } from '../src/api/org/env-delete.ts';
import { createMockLogger, mockFetch } from '@agentuity/test-utils';

describe('org env API', () => {
	describe('orgEnvGet', () => {
		test('should return org env and secrets', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: true,
							data: {
								id: 'org-123',
								env: {
									NODE_ENV: 'production',
									LOG_LEVEL: 'info',
								},
								secrets: {
									API_KEY: '****',
									DB_PASSWORD: '****',
								},
							},
						}),
						{
							status: 200,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			const result = await orgEnvGet(client, { id: 'org-123', mask: true });

			expect(result.id).toBe('org-123');
			expect(result.env?.NODE_ENV).toBe('production');
			expect(result.env?.LOG_LEVEL).toBe('info');
			expect(result.secrets?.API_KEY).toBe('****');
			expect(result.secrets?.DB_PASSWORD).toBe('****');
		});

		test('should request unmasked secrets when mask is false', async () => {
			mockFetch(async (url) => {
				expect(url).toContain('mask=false');
				return new Response(
					JSON.stringify({
						success: true,
						data: {
							id: 'org-123',
							env: {},
							secrets: {
								API_KEY: 'real-api-key-123',
							},
						},
					}),
					{
						status: 200,
						headers: { 'content-type': 'application/json' },
					}
				);
			});

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			const result = await orgEnvGet(client, { id: 'org-123', mask: false });

			expect(result.secrets?.API_KEY).toBe('real-api-key-123');
		});

		test('should handle empty env and secrets', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: true,
							data: {
								id: 'org-123',
								env: {},
								secrets: {},
							},
						}),
						{
							status: 200,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			const result = await orgEnvGet(client, { id: 'org-123' });

			expect(result.env).toEqual({});
			expect(result.secrets).toEqual({});
		});

		test('should throw on failure', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: false,
							message: 'Organization not found',
						}),
						{
							status: 404,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await expect(orgEnvGet(client, { id: 'missing-org' })).rejects.toThrow();
		});
	});

	describe('orgEnvUpdate', () => {
		test('should update org env variables', async () => {
			mockFetch(async (url, init) => {
				expect(url).toContain('/cli/organization/org-123/env');
				expect(init?.method).toBe('PUT');
				const body = JSON.parse(init?.body as string);
				expect(body.env).toEqual({ NEW_VAR: 'value' });
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				});
			});

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await orgEnvUpdate(client, { id: 'org-123', env: { NEW_VAR: 'value' } });
		});

		test('should update org secrets', async () => {
			mockFetch(async (url, init) => {
				expect(url).toContain('/cli/organization/org-123/env');
				expect(init?.method).toBe('PUT');
				const body = JSON.parse(init?.body as string);
				expect(body.secrets).toEqual({ API_KEY: 'secret-value' });
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				});
			});

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await orgEnvUpdate(client, { id: 'org-123', secrets: { API_KEY: 'secret-value' } });
		});

		test('should update both env and secrets', async () => {
			mockFetch(async (_url, init) => {
				const body = JSON.parse(init?.body as string);
				expect(body.env).toEqual({ LOG_LEVEL: 'debug' });
				expect(body.secrets).toEqual({ DB_PASSWORD: 'password123' });
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				});
			});

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await orgEnvUpdate(client, {
				id: 'org-123',
				env: { LOG_LEVEL: 'debug' },
				secrets: { DB_PASSWORD: 'password123' },
			});
		});

		test('should throw on failure', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: false,
							message: 'Admin role required',
						}),
						{
							status: 403,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await expect(
				orgEnvUpdate(client, { id: 'org-123', env: { VAR: 'value' } })
			).rejects.toThrow();
		});
	});

	describe('orgEnvDelete', () => {
		test('should delete org env variables', async () => {
			mockFetch(async (url, init) => {
				expect(url).toContain('/cli/organization/org-123/env');
				expect(init?.method).toBe('DELETE');
				const body = JSON.parse(init?.body as string);
				expect(body.env).toEqual(['OLD_VAR']);
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				});
			});

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await orgEnvDelete(client, { id: 'org-123', env: ['OLD_VAR'] });
		});

		test('should delete org secrets', async () => {
			mockFetch(async (url, init) => {
				expect(url).toContain('/cli/organization/org-123/env');
				expect(init?.method).toBe('DELETE');
				const body = JSON.parse(init?.body as string);
				expect(body.secrets).toEqual(['OLD_SECRET']);
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				});
			});

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await orgEnvDelete(client, { id: 'org-123', secrets: ['OLD_SECRET'] });
		});

		test('should delete both env and secrets', async () => {
			mockFetch(async (_url, init) => {
				const body = JSON.parse(init?.body as string);
				expect(body.env).toEqual(['VAR1', 'VAR2']);
				expect(body.secrets).toEqual(['SECRET1']);
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				});
			});

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await orgEnvDelete(client, {
				id: 'org-123',
				env: ['VAR1', 'VAR2'],
				secrets: ['SECRET1'],
			});
		});

		test('should throw on failure', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: false,
							message: 'Admin role required',
						}),
						{
							status: 403,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await expect(orgEnvDelete(client, { id: 'org-123', env: ['VAR'] })).rejects.toThrow();
		});
	});
});
