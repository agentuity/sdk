import { context, propagation } from '@opentelemetry/api';

/**
 * Injects trace context into response headers using the OpenTelemetry propagation API
 *
 * @param headers - Optional existing headers to include
 * @returns A record of headers with trace context injected
 */
export function injectTraceContextToHeaders(
	headers: Record<string, string> | Headers = {}
): Record<string, string> {
	let _headers: Record<string, string>;
	if (headers instanceof Headers) {
		_headers = {};
		headers.forEach((v, k) => (_headers[k] = v));
	} else {
		_headers = { ...headers };
	}
	// Create a carrier object for the headers
	const carrier: Record<string, string> = { ..._headers } as Record<string, string>;

	// Get the current context
	const currentContext = context.active();

	// Inject trace context into the carrier
	propagation.inject(currentContext, carrier);

	return carrier;
}

/**
 * Extracts trace context from Bun Request headers
 *
 * @param req - The Bun Request object
 * @returns The context with trace information
 */
export function extractTraceContextFromRequest(
	req: Request
): ReturnType<typeof propagation.extract> {
	// Create a carrier object from the headers
	const carrier: Record<string, string> = {};

	// Convert headers to the format expected by the propagator
	req.headers.forEach((value, key) => {
		carrier[key.toLowerCase()] = value;
	});

	// Extract the context using the global propagator
	const activeContext = context.active();
	return propagation.extract(activeContext, carrier);
}
