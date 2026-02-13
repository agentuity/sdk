import { describe, it, expect } from 'bun:test';
import { injectSslMode } from '../src/tls';

describe('injectSslMode', () => {
	it('injects sslmode=require when tls is true and URL has no sslmode', () => {
		const result = injectSslMode('postgresql://user:pass@localhost:5432/db', true);
		expect(result).toContain('sslmode=require');
	});

	it('injects sslmode=require when tls is an object and URL has no sslmode', () => {
		const result = injectSslMode('postgresql://user:pass@localhost:5432/db', {
			rejectUnauthorized: false,
		});
		expect(result).toContain('sslmode=require');
	});

	it('preserves existing sslmode=require in URL', () => {
		const url = 'postgresql://user:pass@localhost:5432/db?sslmode=require';
		const result = injectSslMode(url, true);
		expect(result).toBe(url);
	});

	it('preserves existing sslmode=disable in URL (user intent wins)', () => {
		const url = 'postgresql://user:pass@localhost:5432/db?sslmode=disable';
		const result = injectSslMode(url, true);
		expect(result).toBe(url);
	});

	it('preserves existing sslmode=prefer in URL', () => {
		const url = 'postgresql://user:pass@localhost:5432/db?sslmode=prefer';
		const result = injectSslMode(url, true);
		expect(result).toBe(url);
	});

	it('preserves existing sslmode=verify-full in URL', () => {
		const url = 'postgresql://user:pass@localhost:5432/db?sslmode=verify-full';
		const result = injectSslMode(url, true);
		expect(result).toBe(url);
	});

	it('does NOT inject when tls is undefined', () => {
		const url = 'postgresql://user:pass@localhost:5432/db';
		const result = injectSslMode(url, undefined);
		expect(result).toBe(url);
	});

	it('does NOT inject when tls is false', () => {
		const url = 'postgresql://user:pass@localhost:5432/db';
		const result = injectSslMode(url, false);
		expect(result).toBe(url);
	});

	it('returns undefined when url is undefined', () => {
		const result = injectSslMode(undefined, true);
		expect(result).toBeUndefined();
	});

	it('returns original url when url is not parseable', () => {
		const result = injectSslMode('not-a-valid-url', true);
		expect(result).toBe('not-a-valid-url');
	});

	it('returns empty string when url is empty string', () => {
		const result = injectSslMode('', true);
		expect(result).toBe('');
	});

	it('handles URL with other query params', () => {
		const url =
			'postgresql://user:pass@localhost:5432/db?connect_timeout=10&application_name=test';
		const result = injectSslMode(url, true);
		expect(result).toContain('sslmode=require');
		expect(result).toContain('connect_timeout=10');
		expect(result).toContain('application_name=test');
	});

	it('handles tls as truthy number (edge case)', () => {
		const result = injectSslMode('postgresql://user:pass@localhost:5432/db', 1);
		expect(result).toContain('sslmode=require');
	});

	it('injects when tls is 0 (edge case — not explicitly false or undefined)', () => {
		const url = 'postgresql://user:pass@localhost:5432/db';
		const result = injectSslMode(url, 0);
		// 0 is falsy in JS but injectSslMode only skips on `=== false` or `=== undefined`,
		// so 0 is treated as a truthy-ish TLS intent and injection occurs.
		expect(result).toContain('sslmode=require');
	});

	it('injects when tls is null (edge case — not explicitly false or undefined)', () => {
		const url = 'postgresql://user:pass@localhost:5432/db';
		const result = injectSslMode(url, null);
		// null is not `=== false` and not `=== undefined`, so injection occurs.
		expect(result).toContain('sslmode=require');
	});
});
