import { describe, test, expect } from 'bun:test';
import { APIClient } from '../src/api/api';
import { whoami } from '../src/api/user/whoami';
import { createMockLogger, mockFetch } from '@agentuity/test-utils';

describe('user API', () => {
	describe('whoami', () => {
		test('should return user information', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: true,
							data: {
								firstName: 'John',
								lastName: 'Doe',
								organizations: [
									{ id: 'org-123', name: 'Acme Corp' },
									{ id: 'org-456', name: 'Test Org' },
								],
							},
						}),
						{
							status: 200,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			const user = await whoami(client);

			expect(user.firstName).toBe('John');
			expect(user.lastName).toBe('Doe');
			expect(user.organizations).toHaveLength(2);
			expect(user.organizations[0].id).toBe('org-123');
			expect(user.organizations[0].name).toBe('Acme Corp');
		});

		test('should throw UserResponseError on API error', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: false,
							message: 'Unauthorized',
						}),
						{
							status: 401,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await expect(whoami(client)).rejects.toThrow();
		});

		test('should handle user with no organizations', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: true,
							data: {
								firstName: 'Jane',
								lastName: 'Smith',
								organizations: [],
							},
						}),
						{
							status: 200,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			const user = await whoami(client);

			expect(user.firstName).toBe('Jane');
			expect(user.organizations).toHaveLength(0);
		});
	});
});
