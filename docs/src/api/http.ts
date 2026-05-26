import type { Schema } from '@agentuity/schema';
import type { Context, Handler, MiddlewareHandler } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import type { ApiEnv } from './context';

type StreamChunk = string | Uint8Array;
type StreamBody = ReadableStream<StreamChunk> | AsyncIterable<StreamChunk>;

function isAsyncIterable(value: unknown): value is AsyncIterable<StreamChunk> {
	return (
		typeof value === 'object' &&
		value !== null &&
		Symbol.asyncIterator in value &&
		typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
	);
}

function asyncIterableToStream(iterable: AsyncIterable<StreamChunk>): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			for await (const chunk of iterable) {
				controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
			}
			controller.close();
		},
	});
}

function toResponseBody(body: StreamBody): BodyInit {
	if (body instanceof ReadableStream) {
		return body as BodyInit;
	}

	if (isAsyncIterable(body)) {
		return asyncIterableToStream(body) as BodyInit;
	}

	return String(body);
}

export function jsonValidator(schema: Schema): MiddlewareHandler<ApiEnv> {
	return async (c, next) => {
		let value: unknown;
		try {
			value = await c.req.json();
		} catch {
			return c.json({ error: 'Invalid JSON body' }, 400);
		}

		const parsed = schema.safeParse(value);
		if (!parsed.success) {
			return c.json(
				{
					error: 'Invalid request body',
					issues: parsed.error.issues,
				},
				400
			);
		}

		await next();
	};
}

export function sse(
	callback: (c: Context<ApiEnv>, stream: SSEStreamingApi) => Promise<void>
): Handler<ApiEnv> {
	return (c) => streamSSE(c, (stream) => callback(c, stream));
}

export function stream(callback: (c: Context<ApiEnv>) => Promise<StreamBody>): Handler<ApiEnv> {
	return async (c) => {
		const body = await callback(c);
		return new Response(toResponseBody(body), {
			headers: {
				'content-type': 'text/plain; charset=utf-8',
			},
		});
	};
}

export function waitUntil(c: Context<ApiEnv>, task: Promise<unknown>): void {
	const context = c.var;
	void task.catch((error: unknown) => {
		context.logger?.error('Background task failed', {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}
