import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';

/**
 * Reference to the original fetch function before instrumentation
 */
export const __originalFetch = fetch; // save the original fetch before we patch it

/**
 * Instruments the global fetch function with OpenTelemetry tracing
 *
 * Replaces the global fetch with an instrumented version that creates spans
 * for each HTTP request and propagates trace context in headers
 */
export function instrumentFetch() {
	const patch = async (
		input: string | Request | URL,
		init: RequestInit | undefined
	): Promise<Response> => {
		const url =
			typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

		const method =
			init?.method ||
			(typeof input !== 'string' && !(input instanceof URL) ? input.method || 'GET' : 'GET');

		// Get the active span if it exists
		const activeSpan = trace.getActiveSpan();

		// If there's no active span, just call the original fetch
		if (!activeSpan) {
			return __originalFetch(input, init);
		}

		// Get the current active context
		const currentContext = context.active();
		const _url = new URL(url);

		// Create a child span using the current context
		const childSpan = trace.getTracer('fetch').startSpan(
			`HTTP ${method}`,
			{
				attributes: {
					'http.url': url,
					'http.path': _url.pathname,
					'http.method': method,
					host: _url.host,
				},
			},
			currentContext
		);

		try {
			// Prepare trace context injection
			const carrier: Record<string, string> = {};

			// Create a new context with the child span
			const newContext = trace.setSpan(currentContext, childSpan);

			// Use the new context for propagation
			propagation.inject(newContext, carrier);

			// Preserve original headers and add trace context
			// Handle headers from both Request input and init parameter
			const baseHeaders =
				typeof input !== 'string' && !(input instanceof URL) && input instanceof Request
					? input.headers
					: undefined;
			const headers = new Headers(baseHeaders ?? init?.headers ?? {});

			// Add trace context headers (overwriting any already present)
			for (const [key, value] of Object.entries(carrier)) {
				headers.set(key, value);
			}

			// Create new init object with updated headers
			const newInit = {
				...init,
				headers,
			};

			const response = await __originalFetch(input, newInit);

			// Add response attributes to span
			childSpan.setAttributes({
				'http.status_code': response.status,
				'http.user_agent': response.headers.get('user-agent') || '',
			});

			if (!response.ok) {
				childSpan.setStatus({ code: SpanStatusCode.ERROR });
			} else {
				childSpan.setStatus({ code: SpanStatusCode.OK });
			}

			return response;
		} catch (error) {
			childSpan.recordException(error as Error);
			childSpan.setStatus({ code: SpanStatusCode.ERROR });
			throw error;
		} finally {
			childSpan.end();
		}
	};
	globalThis.fetch = patch as typeof fetch;
}
