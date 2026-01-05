import { describe, test, expect } from 'bun:test';
import { createRouter, validator } from '../src/index';
import { s } from '@agentuity/schema';

describe('createRouter with validator', () => {
	test('validator works with createRouter (not Hono)', async () => {
		const router = createRouter();

		const createUserSchema = s.object({
			name: s.string(),
			email: s.string(),
			age: s.number(),
		});

		router.post(
			'/',
			validator({ input: createUserSchema }),
			async (c) => {
				const data = c.req.valid('json');
				return c.json({
					success: true,
					user: data,
				});
			}
		);

		// Valid request
		const validRes = await router.request('/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Alice', email: 'alice@example.com', age: 30 }),
		});
		expect(validRes.status).toBe(200);
		const validData = await validRes.json();
		expect(validData).toEqual({
			success: true,
			user: { name: 'Alice', email: 'alice@example.com', age: 30 },
		});

		// Invalid request - missing age
		const invalidRes = await router.request('/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Bob', email: 'bob@example.com' }),
		});
		expect(invalidRes.status).toBe(400);
		const errorData = await invalidRes.json();
		expect(errorData.error).toBe('Validation failed');
	});
});
