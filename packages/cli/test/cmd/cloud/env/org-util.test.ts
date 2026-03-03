import { describe, test, expect } from 'bun:test';
import { isOrgScope } from '../../../../src/cmd/cloud/env/org-util';

describe('org-util', () => {
	describe('isOrgScope', () => {
		test('returns true for boolean true', () => {
			expect(isOrgScope(true)).toBe(true);
		});

		test('returns false for boolean false', () => {
			expect(isOrgScope(false)).toBe(false);
		});

		test('returns false for undefined', () => {
			expect(isOrgScope(undefined)).toBe(false);
		});

		test('returns true for non-empty string (explicit org ID)', () => {
			expect(isOrgScope('org_123')).toBe(true);
			expect(isOrgScope('org_abc-def')).toBe(true);
		});

		test('returns false for empty string', () => {
			expect(isOrgScope('')).toBe(false);
		});

		test('returns true for "true" string (from CLI parsing)', () => {
			// Commander.js may pass "true" as a string in some cases
			expect(isOrgScope('true')).toBe(true);
		});
	});
});
