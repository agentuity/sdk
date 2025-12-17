/**
 * Tests for trace state propagation fix in middleware.
 * Verifies that trace.setSpan() correctly updates the trace state.
 */

import { test, expect, describe } from 'bun:test';
import { context, trace } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';

describe('Trace State Update Pattern', () => {
	test('trace.setSpan correctly updates trace state in span context', () => {
		// Create a mock span context
		const mockSpanContext = {
			traceId: '12345678901234567890123456789012',
			spanId: '1234567890123456',
			traceFlags: 1,
			traceState: new TraceState(),
		};

		// Add values to trace state
		let traceState = mockSpanContext.traceState ?? new TraceState();
		traceState = traceState.set('pid', 'proj_test123');
		traceState = traceState.set('oid', 'org_test456');
		traceState = traceState.set('d', '1');

		// Update using trace.setSpan with wrapSpanContext
		const updatedContext = trace.setSpan(
			context.active(),
			trace.wrapSpanContext({
				...mockSpanContext,
				traceState,
			})
		);

		// Get the span from the updated context
		const span = trace.getSpan(updatedContext);
		expect(span).toBeDefined();

		if (span) {
			const sctx = span.spanContext();
			expect(sctx.traceState).toBeDefined();

			// Verify the trace state was updated
			const serialized = sctx.traceState?.serialize();
			expect(serialized).toBeDefined();
			expect(serialized).toContain('pid=proj_test123');
			expect(serialized).toContain('oid=org_test456');
			expect(serialized).toContain('d=1');
		}
	});

	test('trace state serialize format is correct', () => {
		let traceState = new TraceState();
		traceState = traceState.set('pid', 'proj_abc');
		traceState = traceState.set('oid', 'org_xyz');

		const serialized = traceState.serialize();
		expect(serialized).toContain('pid=proj_abc');
		expect(serialized).toContain('oid=org_xyz');
	});
});
