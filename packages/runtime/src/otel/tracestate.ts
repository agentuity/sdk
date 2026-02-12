import { context, trace, TraceFlags, type Context } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';

/**
 * Entries to set on the W3C tracestate header. Each key-value pair is added
 * to the parent context's existing traceState (if any). Values that are
 * `undefined` or empty strings are skipped.
 */
export type TraceStateEntries = Record<string, string | undefined>;

/**
 * Build a context whose span context carries an enriched W3C traceState.
 *
 * The returned context is intended to be passed as the **parent context**
 * to `tracer.startActiveSpan(name, opts, enrichedCtx, fn)` or
 * `tracer.startSpan(name, opts, enrichedCtx)`.  Because the OTel SDK
 * copies `traceState` from a *valid* parent span context into every new
 * child span, the recording span that gets exported to OTLP will carry the
 * enriched traceState — making it visible in backends like ClickHouse.
 *
 * ### How it works
 *
 * 1. If the supplied `parentContext` already contains a span with a valid
 *    span context (e.g. from an incoming `traceparent` header), we enrich
 *    that span context's traceState and wrap it in a `NonRecordingSpan`.
 *
 * 2. If there is **no** valid parent span (e.g. no incoming `traceparent`),
 *    we synthesise a minimal remote span context with a freshly generated
 *    traceId.  The OTel SDK will treat this as a valid remote parent,
 *    inherit both the traceId **and** the traceState, and mark the new
 *    span as a continuation of that trace.
 *
 * @param parentContext  The context to enrich (typically `context.active()`).
 * @param entries        Key-value pairs to merge into the traceState.
 * @returns A new `Context` ready to be used as a parent for span creation.
 */
export function enrichContextWithTraceState(
	parentContext: Context,
	entries: TraceStateEntries
): Context {
	const parentSpan = trace.getSpan(parentContext);
	const parentSctx = parentSpan?.spanContext();

	// Start from any existing traceState on the parent, or a fresh one.
	let traceState = parentSctx?.traceState ?? new TraceState();

	// Merge caller-supplied entries.
	for (const [key, value] of Object.entries(entries)) {
		if (value !== undefined && value !== '') {
			traceState = traceState.set(key, value);
		}
	}

	if (parentSctx && trace.isSpanContextValid(parentSctx)) {
		// The parent already has a valid traceId/spanId (e.g. from an
		// incoming request with `traceparent`).  We just need to update
		// its traceState.
		return trace.setSpan(
			parentContext,
			trace.wrapSpanContext({
				...parentSctx,
				traceState,
			})
		);
	}

	// No valid parent — synthesise a remote parent so the OTel SDK
	// considers the span context valid and copies traceState to the child.
	return trace.setSpan(
		parentContext,
		trace.wrapSpanContext({
			traceId: generateTraceId(),
			spanId: generateSpanId(),
			traceFlags: TraceFlags.SAMPLED,
			isRemote: true,
			traceState,
		})
	);
}

// ── ID generation helpers ────────────────────────────────────────────

/**
 * Generate a random 32-hex-char trace ID (16 bytes).
 * Uses the Web Crypto API which is available in Bun and Node 20+.
 */
export function generateTraceId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return hexFromBytes(bytes);
}

/**
 * Generate a random 16-hex-char span ID (8 bytes).
 */
export function generateSpanId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return hexFromBytes(bytes);
}

function hexFromBytes(bytes: Uint8Array): string {
	let hex = '';
	for (let i = 0; i < bytes.length; i++) {
		hex += (bytes[i] as number).toString(16).padStart(2, '0');
	}
	return hex;
}
