import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { s } from '@agentuity/schema';
import { validator } from '../src/validator';

describe('validator with stream option', () => {
	test('POST route with stream flag skips output validation', async () => {
		const OutputSchema = s.object({ id: s.string(), text: s.string() });

		const app = new Hono().post(
			'/stream',
			validator({
				input: s.object({ query: s.string() }),
				output: OutputSchema,
				stream: true,
			}),
			async (c) => {
				const data = c.req.valid('json');
				expect(data.query).toBe('test');

				// Return a ReadableStream
				return new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode('{"id":"1","text":"chunk1"}\n'));
							controller.enqueue(new TextEncoder().encode('{"id":"2","text":"chunk2"}\n'));
							controller.close();
						},
					}),
					{
						headers: { 'Content-Type': 'text/event-stream' },
					}
				);
			}
		);

		const res = await app.request('/stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'test' }),
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('text/event-stream');

		// Read the stream
		const reader = res.body?.getReader();
		expect(reader).toBeDefined();

		const chunks: string[] = [];
		const decoder = new TextDecoder();

		while (reader) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(decoder.decode(value));
		}

		expect(chunks.join('')).toBe('{"id":"1","text":"chunk1"}\n{"id":"2","text":"chunk2"}\n');
	});

	test('GET route with stream flag and output-only validation', async () => {
		const app = new Hono().get(
			'/events',
			validator({
				output: s.object({ event: s.string() }),
				stream: true,
			}),
			async () => {
				return new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode('{"event":"start"}\n'));
							controller.enqueue(new TextEncoder().encode('{"event":"end"}\n'));
							controller.close();
						},
					}),
					{
						headers: { 'Content-Type': 'text/event-stream' },
					}
				);
			}
		);

		const res = await app.request('/events');

		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('text/event-stream');

		const reader = res.body?.getReader();
		const chunks: string[] = [];
		const decoder = new TextDecoder();

		while (reader) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(decoder.decode(value));
		}

		expect(chunks.join('')).toBe('{"event":"start"}\n{"event":"end"}\n');
	});

	test('non-streaming route with stream: false validates output', async () => {
		const OutputSchema = s.object({ id: s.string() });

		const app = new Hono().post(
			'/create',
			validator({
				input: s.object({ name: s.string() }),
				output: OutputSchema,
				stream: false,
			}),
			async (c) => {
				const data = c.req.valid('json');
				return c.json({ id: '123', name: data.name });
			}
		);

		const res = await app.request('/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Alice' }),
		});

		expect(res.status).toBe(200);
		const result = await res.json();
		// Output validation should strip out the 'name' field (not in schema)
		expect(result).toEqual({ id: '123' });
	});

	test('validator without stream option defaults to non-streaming', async () => {
		const OutputSchema = s.object({ count: s.number() });

		const app = new Hono().get(
			'/count',
			validator({
				output: OutputSchema,
			}),
			async (c) => {
				return c.json({ count: 42, extra: 'should be removed' });
			}
		);

		const res = await app.request('/count');

		expect(res.status).toBe(200);
		const result = await res.json();
		// Output validation should strip out the 'extra' field
		expect(result).toEqual({ count: 42 });
	});

	test('PUT route with stream flag returns ReadableStream', async () => {
		const app = new Hono().put(
			'/update/:id',
			validator({
				input: s.object({ data: s.string() }),
				output: s.object({ status: s.string() }),
				stream: true,
			}),
			async (c) => {
				const input = c.req.valid('json');
				expect(input.data).toBe('test data');

				return new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode('{"status":"processing"}\n'));
							controller.enqueue(new TextEncoder().encode('{"status":"complete"}\n'));
							controller.close();
						},
					}),
					{
						headers: { 'Content-Type': 'application/octet-stream' },
					}
				);
			}
		);

		const res = await app.request('/update/123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ data: 'test data' }),
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
	});
});
