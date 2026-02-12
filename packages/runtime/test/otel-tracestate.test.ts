/**
 * Tests for enrichContextWithTraceState and its integration with the OTel SDK.
 *
 * The core problem being solved:
 *   Previously, traceState was set on a NonRecordingSpan *after* the recording
 *   span was created.  The NonRecordingSpan is never exported, so ClickHouse's
 *   TraceState column was always empty.  The fix moves traceState enrichment
 *   to *before* span creation so the recording span inherits it.
 */

import { test, expect, describe, afterAll } from 'bun:test';
import { context, trace, TraceFlags, ROOT_CONTEXT } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import {
	BasicTracerProvider,
	SimpleSpanProcessor,
	InMemorySpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
	enrichContextWithTraceState,
	generateTraceId,
	generateSpanId,
} from '../src/otel/tracestate';

// ── Test infrastructure ──────────────────────────────────────────────

// Minimal context manager using AsyncLocalStorage so context.active() works
// inside context.with() callbacks (the default NoopContextManager does not propagate)
const als = new AsyncLocalStorage<import('@opentelemetry/api').Context>();
context.setGlobalContextManager({
	active: () => als.getStore() ?? ROOT_CONTEXT,
	with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
		ctx: import('@opentelemetry/api').Context,
		fn: F,
		thisArg?: ThisParameterType<F>,
		...args: A
	): ReturnType<F> {
		return als.run(ctx, () => fn.call(thisArg, ...args));
	},
	bind<T>(
		ctx: import('@opentelemetry/api').Context,
		fn: T,
	): T {
		if (typeof fn === 'function') {
			const callable = fn as (...args: unknown[]) => unknown;
			return ((...args: unknown[]) => als.run(ctx, () => callable(...args))) as T;
		}
		return fn;
	},
	enable() { return this; },
	disable() { return this; },
});

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
	spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);

const tracer = trace.getTracer('test-tracer');

afterAll(async () => {
	await provider.shutdown();
});

// ── Helper utilities ─────────────────────────────────────────────────

/** Parse a W3C tracestate serialisation into a plain object. */
function parseTraceState(ts: { serialize(): string } | undefined): Record<string, string> {
	if (!ts) return {};
	const raw = ts.serialize();
	if (!raw) return {};
	const result: Record<string, string> = {};
	for (const pair of raw.split(',')) {
		const [k, v] = pair.split('=');
		if (k && v) result[k.trim()] = v.trim();
	}
	return result;
}

// ── Unit tests for enrichContextWithTraceState ───────────────────────

describe('enrichContextWithTraceState', () => {
	// -- Context-level tests (no real spans, just NonRecordingSpan) -----

	describe('with valid parent span context (incoming traceparent)', () => {
		test('enriches existing traceState on the parent', () => {
			const parentSctx = {
				traceId: 'aaaabbbbccccdddd1111222233334444',
				spanId: 'aaaabbbbccccdddd',
				traceFlags: TraceFlags.SAMPLED,
				isRemote: true,
				traceState: new TraceState('existing=value'),
			};
			const parentCtx = trace.setSpan(
				ROOT_CONTEXT,
				trace.wrapSpanContext(parentSctx)
			);

			const enriched = enrichContextWithTraceState(parentCtx, {
				pid: 'proj_123',
				oid: 'org_456',
			});

			const span = trace.getSpan(enriched);
			expect(span).toBeDefined();
			const sctx = span!.spanContext();

			// Original traceId/spanId preserved
			expect(sctx.traceId).toBe('aaaabbbbccccdddd1111222233334444');
			expect(sctx.spanId).toBe('aaaabbbbccccdddd');

			// TraceState has both old and new entries
			const ts = parseTraceState(sctx.traceState);
			expect(ts['existing']).toBe('value');
			expect(ts['pid']).toBe('proj_123');
			expect(ts['oid']).toBe('org_456');
		});

		test('preserves isRemote flag from parent', () => {
			const parentSctx = {
				traceId: 'aaaabbbbccccdddd1111222233334444',
				spanId: 'aaaabbbbccccdddd',
				traceFlags: TraceFlags.SAMPLED,
				isRemote: true,
			};
			const parentCtx = trace.setSpan(
				ROOT_CONTEXT,
				trace.wrapSpanContext(parentSctx)
			);

			const enriched = enrichContextWithTraceState(parentCtx, { pid: 'p' });
			const sctx = trace.getSpan(enriched)!.spanContext();
			expect(sctx.isRemote).toBe(true);
		});
	});

	describe('without valid parent span context (no incoming traceparent)', () => {
		test('creates a synthetic remote parent with traceState', () => {
			const enriched = enrichContextWithTraceState(ROOT_CONTEXT, {
				pid: 'proj_abc',
				oid: 'org_xyz',
				d: '1',
			});

			const span = trace.getSpan(enriched);
			expect(span).toBeDefined();
			const sctx = span!.spanContext();

			// Should have valid IDs (32-char traceId, 16-char spanId)
			expect(sctx.traceId).toHaveLength(32);
			expect(sctx.spanId).toHaveLength(16);
			expect(sctx.traceId).not.toBe('00000000000000000000000000000000');
			expect(sctx.spanId).not.toBe('0000000000000000');

			// Marked as remote so the OTel SDK treats it as a valid parent
			expect(sctx.isRemote).toBe(true);
			expect(sctx.traceFlags).toBe(TraceFlags.SAMPLED);

			// TraceState has the entries
			const ts = parseTraceState(sctx.traceState);
			expect(ts['pid']).toBe('proj_abc');
			expect(ts['oid']).toBe('org_xyz');
			expect(ts['d']).toBe('1');
		});
	});

	describe('entry filtering', () => {
		test('skips undefined values', () => {
			const enriched = enrichContextWithTraceState(ROOT_CONTEXT, {
				pid: 'proj_1',
				oid: undefined,
				did: 'dep_1',
			});

			const ts = parseTraceState(trace.getSpan(enriched)!.spanContext().traceState);
			expect(ts['pid']).toBe('proj_1');
			expect(ts['did']).toBe('dep_1');
			expect(ts['oid']).toBeUndefined();
		});

		test('skips empty string values', () => {
			const enriched = enrichContextWithTraceState(ROOT_CONTEXT, {
				pid: '',
				oid: 'org_1',
			});

			const ts = parseTraceState(trace.getSpan(enriched)!.spanContext().traceState);
			expect(ts['pid']).toBeUndefined();
			expect(ts['oid']).toBe('org_1');
		});

		test('handles empty entries (no-op)', () => {
			const enriched = enrichContextWithTraceState(ROOT_CONTEXT, {});

			// Should still create a synthetic parent
			const span = trace.getSpan(enriched);
			expect(span).toBeDefined();
			// But traceState is empty
			const ts = parseTraceState(span!.spanContext().traceState);
			expect(Object.keys(ts)).toHaveLength(0);
		});
	});
});

// ── Integration tests: recording span inherits traceState ────────────

describe('Recording span inheritance (integration)', () => {
	test('startActiveSpan inherits traceState from enriched parent (with incoming traceparent)', () => {
		exporter.reset();

		// Simulate incoming request with traceparent
		const incomingParent = {
			traceId: 'aabb00112233445566778899aabbccdd',
			spanId: 'aabb001122334455',
			traceFlags: TraceFlags.SAMPLED,
			isRemote: true,
		};
		const incomingCtx = trace.setSpan(
			ROOT_CONTEXT,
			trace.wrapSpanContext(incomingParent)
		);

		// Enrich BEFORE span creation
		const enriched = enrichContextWithTraceState(incomingCtx, {
			pid: 'proj_export_test',
			oid: 'org_export_test',
			did: 'dep_export_test',
			d: '1',
		});

		// Create the recording span with the enriched context
		const span = tracer.startSpan('test-server-span', {}, enriched);
		span.end();

		// Verify the EXPORTED span has traceState
		const exportedSpans = exporter.getFinishedSpans();
		expect(exportedSpans).toHaveLength(1);

		const exported = exportedSpans[0];

		// Should continue the incoming trace
		expect(exported.spanContext().traceId).toBe('aabb00112233445566778899aabbccdd');

		// The critical assertion: the exported span's traceState has our entries
		const ts = parseTraceState(exported.spanContext().traceState);
		expect(ts['pid']).toBe('proj_export_test');
		expect(ts['oid']).toBe('org_export_test');
		expect(ts['did']).toBe('dep_export_test');
		expect(ts['d']).toBe('1');
	});

	test('startActiveSpan inherits traceState from enriched parent (no incoming traceparent)', () => {
		exporter.reset();

		// No incoming context — simulate fresh API request
		const enriched = enrichContextWithTraceState(ROOT_CONTEXT, {
			pid: 'proj_root',
			oid: 'org_root',
		});

		// Create the recording span
		const span = tracer.startSpan('test-root-span', {}, enriched);
		span.end();

		const exportedSpans = exporter.getFinishedSpans();
		expect(exportedSpans).toHaveLength(1);

		const exported = exportedSpans[0];

		// Should have a valid (non-zero) traceId
		expect(exported.spanContext().traceId).toHaveLength(32);
		expect(exported.spanContext().traceId).not.toBe('00000000000000000000000000000000');

		// The critical assertion: exported span carries traceState
		const ts = parseTraceState(exported.spanContext().traceState);
		expect(ts['pid']).toBe('proj_root');
		expect(ts['oid']).toBe('org_root');
	});

	test('startActiveSpan (4-arg overload) inherits traceState', async () => {
		exporter.reset();

		const enriched = enrichContextWithTraceState(ROOT_CONTEXT, {
			pid: 'proj_4arg',
			aid: 'agent_123',
		});

		let capturedTraceState: Record<string, string> = {};

		await tracer.startActiveSpan(
			'test-4arg-span',
			{},
			enriched,
			async (span) => {
				// Inside the callback, the recording span should have traceState
				capturedTraceState = parseTraceState(span.spanContext().traceState);
				span.end();
			}
		);

		// Verify from inside the callback
		expect(capturedTraceState['pid']).toBe('proj_4arg');
		expect(capturedTraceState['aid']).toBe('agent_123');

		// Also verify the exported span
		const exportedSpans = exporter.getFinishedSpans();
		expect(exportedSpans).toHaveLength(1);
		const ts = parseTraceState(exportedSpans[0].spanContext().traceState);
		expect(ts['pid']).toBe('proj_4arg');
		expect(ts['aid']).toBe('agent_123');
	});

	test('child span inherits traceState from parent recording span', async () => {
		exporter.reset();

		const enriched = enrichContextWithTraceState(ROOT_CONTEXT, {
			pid: 'proj_child',
			oid: 'org_child',
		});

		await tracer.startActiveSpan(
			'parent-span',
			{},
			enriched,
			async (parentSpan) => {
				// Create a child span within the parent's context
				const childSpan = tracer.startSpan('child-span');
				childSpan.end();
				parentSpan.end();
			}
		);

		const exportedSpans = exporter.getFinishedSpans();
		expect(exportedSpans).toHaveLength(2);

		// Both parent and child should have the same traceState
		for (const exported of exportedSpans) {
			const ts = parseTraceState(exported.spanContext().traceState);
			expect(ts['pid']).toBe('proj_child');
			expect(ts['oid']).toBe('org_child');
		}

		// And they should share the same traceId
		const traceIds = new Set(exportedSpans.map((s) => s.spanContext().traceId));
		expect(traceIds.size).toBe(1);
	});

	test('agent span enrichment adds aid while preserving parent traceState', async () => {
		exporter.reset();

		// Step 1: Middleware enriches context with pid/oid (simulating our middleware fix)
		const middlewareEnriched = enrichContextWithTraceState(ROOT_CONTEXT, {
			pid: 'proj_mid',
			oid: 'org_mid',
		});

		await tracer.startActiveSpan(
			'http-server-span',
			{},
			middlewareEnriched,
			async (serverSpan) => {
				// Step 2: Agent execution enriches context with aid (simulating agent.ts fix)
				const agentEnriched = enrichContextWithTraceState(context.active(), {
					aid: 'agent_42',
					pid: 'proj_mid',
					oid: 'org_mid',
				});

				const agentSpan = tracer.startSpan('agent.run', {}, agentEnriched);
				agentSpan.end();
				serverSpan.end();
			}
		);

		const exportedSpans = exporter.getFinishedSpans();
		expect(exportedSpans).toHaveLength(2);

		// Server span should have pid/oid but NOT aid
		const serverExported = exportedSpans.find((s) => s.name === 'http-server-span')!;
		const serverTs = parseTraceState(serverExported.spanContext().traceState);
		expect(serverTs['pid']).toBe('proj_mid');
		expect(serverTs['oid']).toBe('org_mid');
		expect(serverTs['aid']).toBeUndefined();

		// Agent span should have pid/oid AND aid
		const agentExported = exportedSpans.find((s) => s.name === 'agent.run')!;
		const agentTs = parseTraceState(agentExported.spanContext().traceState);
		expect(agentTs['pid']).toBe('proj_mid');
		expect(agentTs['oid']).toBe('org_mid');
		expect(agentTs['aid']).toBe('agent_42');
	});
});

// ── Unit tests for ID generation helpers ─────────────────────────────

describe('ID generation', () => {
	test('generateTraceId produces 32-char hex string', () => {
		const id = generateTraceId();
		expect(id).toHaveLength(32);
		expect(id).toMatch(/^[0-9a-f]{32}$/);
	});

	test('generateSpanId produces 16-char hex string', () => {
		const id = generateSpanId();
		expect(id).toHaveLength(16);
		expect(id).toMatch(/^[0-9a-f]{16}$/);
	});

	test('generated IDs are unique', () => {
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ids.add(generateTraceId());
		}
		expect(ids.size).toBe(100);
	});
});
