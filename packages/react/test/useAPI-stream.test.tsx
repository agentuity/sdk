import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { useAPI } from '../src/api';
import { AgentuityProvider } from '../src/context';

declare module '../src/types' {
	interface RouteRegistry {
		'GET /stream': {
			inputSchema: never;
			outputSchema: {
				'~standard': {
					version: 1;
					vendor: 'agentuity';
					validate: (v: unknown) => { value: { id: number; text: string } };
				};
			};
			stream: true;
		};
		'POST /stream': {
			inputSchema: {
				'~standard': {
					version: 1;
					vendor: 'agentuity';
					validate: (v: unknown) => { value: { query: string } };
				};
			};
			outputSchema: {
				'~standard': {
					version: 1;
					vendor: 'agentuity';
					validate: (v: unknown) => { value: { result: string } };
				};
			};
			stream: true;
		};
	}
}

describe('useAPI - streaming support', () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		global.fetch = mock(() => Promise.resolve({} as Response));
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	test('GET streaming route returns array data type', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"id":1,"text":"chunk1"}\n'));
				controller.enqueue(new TextEncoder().encode('{"id":2,"text":"chunk2"}\n'));
				controller.close();
			},
		});

		global.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				headers: new Headers({ 'Content-Type': 'text/event-stream' }),
				body: mockStream,
			} as Response)
		);

		let capturedData: { id: number; text: string }[] | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream');
			capturedData = data;
			return null;
		}

		render(
			<AgentuityProvider baseUrl="http://localhost">
				<TestComponent />
			</AgentuityProvider>
		);

		await waitFor(
			() => {
				expect(capturedData).toBeDefined();
				expect(Array.isArray(capturedData)).toBe(true);
				expect(capturedData?.length).toBe(2);
			},
			{ timeout: 1000 }
		);

		expect(capturedData).toEqual([
			{ id: 1, text: 'chunk1' },
			{ id: 2, text: 'chunk2' },
		]);
	});

	test('POST streaming route with invoke returns array', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"result":"result1"}\n'));
				controller.enqueue(new TextEncoder().encode('{"result":"result2"}\n'));
				controller.enqueue(new TextEncoder().encode('{"result":"result3"}\n'));
				controller.close();
			},
		});

		global.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
				body: mockStream,
			} as Response)
		);

		let capturedData: { result: string }[] | undefined;

		function TestComponent() {
			const { data, invoke } = useAPI('POST /stream');
			capturedData = data;

			React.useEffect(() => {
				invoke({ query: 'test' });
			}, [invoke]);

			return null;
		}

		render(
			<AgentuityProvider baseUrl="http://localhost">
				<TestComponent />
			</AgentuityProvider>
		);

		await waitFor(
			() => {
				expect(capturedData).toBeDefined();
				expect(Array.isArray(capturedData)).toBe(true);
				expect(capturedData?.length).toBe(3);
			},
			{ timeout: 1000 }
		);

		expect(capturedData).toEqual([
			{ result: 'result1' },
			{ result: 'result2' },
			{ result: 'result3' },
		]);
	});

	test('custom delimiter splits stream chunks correctly', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"id":1,"text":"a"}||'));
				controller.enqueue(new TextEncoder().encode('{"id":2,"text":"b"}||'));
				controller.enqueue(new TextEncoder().encode('{"id":3,"text":"c"}'));
				controller.close();
			},
		});

		global.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				headers: new Headers({ 'Content-Type': 'text/event-stream' }),
				body: mockStream,
			} as Response)
		);

		let capturedData: { id: number; text: string }[] | undefined;

		function TestComponent() {
			const { data } = useAPI({
				route: 'GET /stream',
				delimiter: '||',
			});
			capturedData = data;
			return null;
		}

		render(
			<AgentuityProvider baseUrl="http://localhost">
				<TestComponent />
			</AgentuityProvider>
		);

		await waitFor(
			() => {
				expect(capturedData?.length).toBe(3);
			},
			{ timeout: 1000 }
		);

		expect(capturedData).toEqual([
			{ id: 1, text: 'a' },
			{ id: 2, text: 'b' },
			{ id: 3, text: 'c' },
		]);
	});

	test('onChunk transform callback modifies chunks', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"id":1,"text":"hello"}\n'));
				controller.enqueue(new TextEncoder().encode('{"id":2,"text":"world"}\n'));
				controller.close();
			},
		});

		global.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				headers: new Headers({ 'Content-Type': 'text/event-stream' }),
				body: mockStream,
			} as Response)
		);

		let capturedData: { id: number; text: string }[] | undefined;

		function TestComponent() {
			const { data } = useAPI({
				route: 'GET /stream',
				onChunk: (chunk) => ({
					...chunk,
					text: chunk.text.toUpperCase(),
				}),
			});
			capturedData = data;
			return null;
		}

		render(
			<AgentuityProvider baseUrl="http://localhost">
				<TestComponent />
			</AgentuityProvider>
		);

		await waitFor(
			() => {
				expect(capturedData?.length).toBe(2);
			},
			{ timeout: 1000 }
		);

		expect(capturedData).toEqual([
			{ id: 1, text: 'HELLO' },
			{ id: 2, text: 'WORLD' },
		]);
	});

	test('plain text stream (ReadableStream<string>) without JSON encoding', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('hello\n'));
				controller.enqueue(new TextEncoder().encode('world\n'));
				controller.enqueue(new TextEncoder().encode('from stream'));
				controller.close();
			},
		});

		global.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				headers: new Headers({ 'Content-Type': 'text/event-stream' }),
				body: mockStream,
			} as Response)
		);

		let capturedData: string[] | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream');
			capturedData = data;
			return null;
		}

		render(
			<AgentuityProvider baseUrl="http://localhost">
				<TestComponent />
			</AgentuityProvider>
		);

		await waitFor(
			() => {
				expect(capturedData?.length).toBe(3);
			},
			{ timeout: 1000 }
		);

		expect(capturedData).toEqual(['hello', 'world', 'from stream']);
	});

	test('JSON-encoded string stream (ReadableStream<string>) with quotes', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('"hello"\n'));
				controller.enqueue(new TextEncoder().encode('"world"\n'));
				controller.close();
			},
		});

		global.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				headers: new Headers({ 'Content-Type': 'text/event-stream' }),
				body: mockStream,
			} as Response)
		);

		let capturedData: string[] | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream');
			capturedData = data;
			return null;
		}

		render(
			<AgentuityProvider baseUrl="http://localhost">
				<TestComponent />
			</AgentuityProvider>
		);

		await waitFor(
			() => {
				expect(capturedData?.length).toBe(2);
			},
			{ timeout: 1000 }
		);

		// JSON.parse strips the quotes
		expect(capturedData).toEqual(['hello', 'world']);
	});

	test('mixed JSON and plain text chunks are handled gracefully', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"id":1,"text":"valid"}\n'));
				controller.enqueue(new TextEncoder().encode('plain text chunk\n'));
				controller.enqueue(new TextEncoder().encode('{"id":2,"text":"another valid"}\n'));
				controller.close();
			},
		});

		global.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				headers: new Headers({ 'Content-Type': 'text/event-stream' }),
				body: mockStream,
			} as Response)
		);

		let capturedData: unknown[] | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream');
			capturedData = data;
			return null;
		}

		render(
			<AgentuityProvider baseUrl="http://localhost">
				<TestComponent />
			</AgentuityProvider>
		);

		await waitFor(
			() => {
				expect(capturedData?.length).toBe(3);
			},
			{ timeout: 1000 }
		);

		// First chunk is parsed as JSON object
		expect(capturedData?.[0]).toEqual({ id: 1, text: 'valid' });
		// Second chunk is treated as plain string (JSON parse failed)
		expect(capturedData?.[1]).toBe('plain text chunk');
		// Third chunk is parsed as JSON object
		expect(capturedData?.[2]).toEqual({ id: 2, text: 'another valid' });
	});
});
