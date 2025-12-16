import { describe, test, expect } from 'bun:test';
import { createRouter } from '../src/router';
import { Hono } from 'hono';

describe('router.stream() method', () => {
	test('stream route sets Content-Type to application/octet-stream', async () => {
		const router = createRouter();

		router.stream('/events', () => {
			return new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('chunk1\n'));
					controller.enqueue(new TextEncoder().encode('chunk2\n'));
					controller.close();
				},
			});
		});

		const app = new Hono();
		app.route('/', router);

		const res = await app.request('/events', { method: 'POST' });

		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('application/octet-stream');

		const text = await res.text();
		expect(text).toBe('chunk1\nchunk2\n');
	});

	test('stream route with middleware sets Content-Type', async () => {
		const router = createRouter();
		let middlewareRan = false;

		router.stream(
			'/protected',
			async (_c, next) => {
				middlewareRan = true;
				await next();
			},
			() => {
				return new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('data'));
						controller.close();
					},
				});
			}
		);

		const app = new Hono();
		app.route('/', router);

		const res = await app.request('/protected', { method: 'POST' });

		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
		expect(middlewareRan).toBe(true);
	});
});
