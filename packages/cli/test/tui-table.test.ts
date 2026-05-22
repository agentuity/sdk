import { describe, expect, test } from 'bun:test';
import { table } from '../src/tui';

/**
 * Regression: the table renderer used a CommonJS `require('cli-table3')`
 * which threw `ReferenceError: require is not defined` under the v3
 * ESM CLI runtime, breaking `project list`, `project get`, and
 * `project show`. The renderer is now an ESM import; this exercises it
 * end-to-end so we can't regress back to require().
 */
describe('tui.table (ESM renderer regression)', () => {
	test('renders horizontal layout for short rows without throwing', () => {
		const data = [
			{ id: 'proj_1', name: 'alpha', orgId: 'org_a' },
			{ id: 'proj_2', name: 'beta', orgId: 'org_a' },
		];
		const out = table(data, undefined, { render: true });
		expect(typeof out).toBe('string');
		expect(out).toContain('proj_1');
		expect(out).toContain('alpha');
	});

	test('renders vertical layout for a single-row payload', () => {
		const data = [
			{
				id: 'proj_a1f61189ada3e92d4c65e2c05772017e',
				name: 'static-html-test',
				description: '',
				orgId: 'org_38uEd1JNXIe89KMPaOwx1WJW43o',
			},
		];
		const out = table(data, undefined, { render: true, layout: 'vertical' });
		expect(typeof out).toBe('string');
		expect(out).toContain('static-html-test');
		expect(out).toContain('proj_a1f61189ada3e92d4c65e2c05772017e');
	});

	test('handles empty data without throwing', () => {
		const out = table([], undefined, { render: true });
		expect(typeof out).toBe('string');
	});
});
