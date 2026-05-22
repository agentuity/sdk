import { describe, expect, test } from 'bun:test';
import { generateId, safeStringify, stripQueryString } from '../src/util';

describe('@agentuity/analytics util', () => {
	describe('generateId', () => {
		test('returns a non-empty string', () => {
			const id = generateId();
			expect(id).toBeString();
			expect(id.length).toBeGreaterThan(0);
		});

		test('returns a different value on each call', () => {
			const a = generateId();
			const b = generateId();
			expect(a).not.toBe(b);
		});
	});

	describe('safeStringify', () => {
		test('returns empty string for null and undefined', () => {
			expect(safeStringify(null)).toBe('');
			expect(safeStringify(undefined)).toBe('');
		});

		test('serialises plain objects', () => {
			expect(safeStringify({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}');
		});

		test('serialises arrays', () => {
			expect(safeStringify([1, 2, 3])).toBe('[1,2,3]');
		});

		test('serialises primitives', () => {
			expect(safeStringify(42)).toBe('42');
			expect(safeStringify('hello')).toBe('"hello"');
			expect(safeStringify(true)).toBe('true');
		});

		test('handles circular references without throwing', () => {
			type Node = { name: string; self?: Node };
			const obj: Node = { name: 'root' };
			obj.self = obj;

			const out = safeStringify(obj);
			expect(out).toContain('"name":"root"');
			expect(out).toContain('[Circular]');
		});
	});

	describe('stripQueryString', () => {
		test('returns empty string for empty input', () => {
			expect(stripQueryString('')).toBe('');
		});

		test('strips the query string from a full URL', () => {
			expect(stripQueryString('https://example.com/path?a=1&b=2')).toBe(
				'https://example.com/path'
			);
		});

		test('preserves URLs without a query string', () => {
			expect(stripQueryString('https://example.com/path')).toBe('https://example.com/path');
		});

		test('drops the fragment along with the query', () => {
			// URL parser yields origin + pathname only; hash and search both go.
			expect(stripQueryString('https://example.com/path?x=1#frag')).toBe(
				'https://example.com/path'
			);
		});

		test('falls back to a substring split on un-parseable input', () => {
			// '/relative?x=1' is not a valid URL on its own; the function
			// should still strip everything from '?' onwards.
			expect(stripQueryString('/relative?x=1&y=2')).toBe('/relative');
		});
	});
});
