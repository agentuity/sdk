import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { useAPI } from '../src/api';
import { AgentuityProvider } from '../src/context';

/**
 * Integration tests for streaming with different output schema types.
 * These tests validate the end-to-end flow from streaming agents to React components.
 */

declare module '../src/types' {
	interface RouteRegistry {
		// Object type stream
		'GET /stream/objects': {
			inputSchema: never;
			outputSchema: {
				'~standard': {
					version: 1;
					vendor: 'agentuity';
					validate: (v: unknown) => { value: { id: number; name: string; timestamp: number } };
				};
			};
			stream: true;
		};
		// String type stream
		'GET /stream/strings': {
			inputSchema: never;
			outputSchema: {
				'~standard': {
					version: 1;
					vendor: 'agentuity';
					validate: (v: unknown) => { value: string };
				};
			};
			stream: true;
		};
		// Number type stream
		'GET /stream/numbers': {
			inputSchema: never;
			outputSchema: {
				'~standard': {
					version: 1;
					vendor: 'agentuity';
					validate: (v: unknown) => { value: number };
				};
			};
			stream: true;
		};
		// Boolean type stream
		'GET /stream/booleans': {
			inputSchema: never;
			outputSchema: {
				'~standard': {
					version: 1;
					vendor: 'agentuity';
					validate: (v: unknown) => { value: boolean };
				};
			};
			stream: true;
		};
		// Nested object type stream
		'GET /stream/nested': {
			inputSchema: never;
			outputSchema: {
				'~standard': {
					version: 1;
					vendor: 'agentuity';
					validate: (v: unknown) => {
						value: {
							user: { id: number; profile: { name: string; email: string } };
							metadata: { tags: string[] };
						};
					};
				};
			};
			stream: true;
		};
		// Array type stream (array of objects)
		'GET /stream/arrays': {
			inputSchema: never;
			outputSchema: {
				'~standard': {
					version: 1;
					vendor: 'agentuity';
					validate: (v: unknown) => { value: Array<{ x: number; y: number }> };
				};
			};
			stream: true;
		};
		// Plain text stream (no schema)
		'GET /stream/plain': {
			inputSchema: never;
			outputSchema: never;
			stream: true;
		};
	}
}

describe('useAPI - Stream Integration Tests', () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		global.fetch = mock(() => Promise.resolve({} as Response));
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	test('streaming objects - ReadableStream<{ id, name, timestamp }>', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode('{"id":1,"name":"Alice","timestamp":1234567890}\n')
				);
				controller.enqueue(
					new TextEncoder().encode('{"id":2,"name":"Bob","timestamp":1234567891}\n')
				);
				controller.enqueue(
					new TextEncoder().encode('{"id":3,"name":"Charlie","timestamp":1234567892}')
				);
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

		let capturedData: Array<{ id: number; name: string; timestamp: number }> | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream/objects');
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
			{ id: 1, name: 'Alice', timestamp: 1234567890 },
			{ id: 2, name: 'Bob', timestamp: 1234567891 },
			{ id: 3, name: 'Charlie', timestamp: 1234567892 },
		]);
	});

	test('streaming strings - ReadableStream<string> with JSON encoding', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('"Hello"\n'));
				controller.enqueue(new TextEncoder().encode('"World"\n'));
				controller.enqueue(new TextEncoder().encode('"From"\n'));
				controller.enqueue(new TextEncoder().encode('"Stream"'));
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
			const { data } = useAPI('GET /stream/strings');
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
				expect(capturedData?.length).toBe(4);
			},
			{ timeout: 1000 }
		);

		expect(capturedData).toEqual(['Hello', 'World', 'From', 'Stream']);
	});

	test('streaming strings - ReadableStream<string> plain text without JSON encoding', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('Line 1\n'));
				controller.enqueue(new TextEncoder().encode('Line 2\n'));
				controller.enqueue(new TextEncoder().encode('Line 3'));
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
			const { data } = useAPI('GET /stream/strings');
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

		expect(capturedData).toEqual(['Line 1', 'Line 2', 'Line 3']);
	});

	test('streaming numbers - ReadableStream<number>', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('42\n'));
				controller.enqueue(new TextEncoder().encode('3.14\n'));
				controller.enqueue(new TextEncoder().encode('-100\n'));
				controller.enqueue(new TextEncoder().encode('0'));
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

		let capturedData: number[] | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream/numbers');
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
				expect(capturedData?.length).toBe(4);
			},
			{ timeout: 1000 }
		);

		expect(capturedData).toEqual([42, 3.14, -100, 0]);
	});

	test('streaming booleans - ReadableStream<boolean>', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('true\n'));
				controller.enqueue(new TextEncoder().encode('false\n'));
				controller.enqueue(new TextEncoder().encode('true'));
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

		let capturedData: boolean[] | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream/booleans');
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

		expect(capturedData).toEqual([true, false, true]);
	});

	test('streaming nested objects - complex schema', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode(
						'{"user":{"id":1,"profile":{"name":"Alice","email":"alice@example.com"}},"metadata":{"tags":["admin","active"]}}\n'
					)
				);
				controller.enqueue(
					new TextEncoder().encode(
						'{"user":{"id":2,"profile":{"name":"Bob","email":"bob@example.com"}},"metadata":{"tags":["user"]}}'
					)
				);
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

		type NestedData = {
			user: { id: number; profile: { name: string; email: string } };
			metadata: { tags: string[] };
		};
		let capturedData: NestedData[] | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream/nested');
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
			{
				user: { id: 1, profile: { name: 'Alice', email: 'alice@example.com' } },
				metadata: { tags: ['admin', 'active'] },
			},
			{
				user: { id: 2, profile: { name: 'Bob', email: 'bob@example.com' } },
				metadata: { tags: ['user'] },
			},
		]);
	});

	test('streaming arrays - ReadableStream<Array<{x, y}>>', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('[{"x":1,"y":2},{"x":3,"y":4}]\n'));
				controller.enqueue(new TextEncoder().encode('[{"x":5,"y":6}]\n'));
				controller.enqueue(new TextEncoder().encode('[]'));
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

		let capturedData: Array<Array<{ x: number; y: number }>> | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream/arrays');
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
			[
				{ x: 1, y: 2 },
				{ x: 3, y: 4 },
			],
			[{ x: 5, y: 6 }],
			[],
		]);
	});

	test('streaming with custom delimiter (pipe-separated)', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode('{"id":1,"name":"Alice"}|{"id":2,"name":"Bob"}|')
				);
				controller.enqueue(new TextEncoder().encode('{"id":3,"name":"Charlie"}'));
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

		let capturedData: Array<{ id: number; name: string }> | undefined;

		function TestComponent() {
			const { data } = useAPI({
				route: 'GET /stream/objects',
				delimiter: '|',
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
			{ id: 1, name: 'Alice' },
			{ id: 2, name: 'Bob' },
			{ id: 3, name: 'Charlie' },
		]);
	});

	test('streaming with onChunk transform - uppercase strings', async () => {
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
			const { data } = useAPI({
				route: 'GET /stream/strings',
				onChunk: (chunk: string) => chunk.toUpperCase(),
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

		expect(capturedData).toEqual(['HELLO', 'WORLD']);
	});

	test('streaming with onChunk transform - filter and modify objects', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"id":1,"name":"Alice","active":true}\n'));
				controller.enqueue(new TextEncoder().encode('{"id":2,"name":"Bob","active":false}\n'));
				controller.enqueue(new TextEncoder().encode('{"id":3,"name":"Charlie","active":true}'));
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

		let capturedData: Array<{ id: number; name: string; timestamp: number }> | undefined;

		function TestComponent() {
			const { data } = useAPI({
				route: 'GET /stream/objects',
				onChunk: (chunk: { id: number; name: string; active: boolean }) => ({
					id: chunk.id,
					name: chunk.name,
					timestamp: Date.now(),
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
				expect(capturedData?.length).toBe(3);
			},
			{ timeout: 1000 }
		);

		expect(capturedData?.length).toBe(3);
		expect(capturedData?.[0]).toHaveProperty('id', 1);
		expect(capturedData?.[0]).toHaveProperty('name', 'Alice');
		expect(capturedData?.[0]).toHaveProperty('timestamp');
		expect(typeof capturedData?.[0].timestamp).toBe('number');
	});

	test('streaming with async onChunk transform', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('1\n'));
				controller.enqueue(new TextEncoder().encode('2\n'));
				controller.enqueue(new TextEncoder().encode('3'));
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

		let capturedData: number[] | undefined;

		function TestComponent() {
			const { data } = useAPI({
				route: 'GET /stream/numbers',
				onChunk: async (chunk: number) => {
					// Simulate async processing
					await new Promise((resolve) => setTimeout(resolve, 1));
					return chunk * 10;
				},
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

		expect(capturedData).toEqual([10, 20, 30]);
	});

	test('empty stream returns empty array', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
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

		let capturedData: Array<{ id: number; name: string }> | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream/objects');
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
			},
			{ timeout: 500 }
		);

		expect(capturedData).toEqual([]);
	});

	test('whitespace-only chunks are ignored', async () => {
		const mockStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"id":1}\n'));
				controller.enqueue(new TextEncoder().encode('   \n'));
				controller.enqueue(new TextEncoder().encode('\n'));
				controller.enqueue(new TextEncoder().encode('{"id":2}\n'));
				controller.enqueue(new TextEncoder().encode('\t\t\n'));
				controller.enqueue(new TextEncoder().encode('{"id":3}'));
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

		let capturedData: Array<{ id: number }> | undefined;

		function TestComponent() {
			const { data } = useAPI('GET /stream/objects');
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

		expect(capturedData).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
	});
});
