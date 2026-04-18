import { describe, expect, test } from 'bun:test';
import { getCliVersionSpecifier } from '../src/index.ts';

describe('getCliVersionSpecifier', () => {
	describe('prerelease versions use the prerelease tag', () => {
		test('3.0.0-alpha.0 should return alpha', () => {
			expect(getCliVersionSpecifier('3.0.0-alpha.0')).toBe('alpha');
		});
		test('3.0.0-alpha.1 should return alpha', () => {
			expect(getCliVersionSpecifier('3.0.0-alpha.1')).toBe('alpha');
		});
		test('1.0.0-alpha.10 should return alpha', () => {
			expect(getCliVersionSpecifier('1.0.0-alpha.10')).toBe('alpha');
		});
		test('2.0.0-beta.0 should return beta', () => {
			expect(getCliVersionSpecifier('2.0.0-beta.0')).toBe('beta');
		});
		test('2.0.0-beta.1 should return beta', () => {
			expect(getCliVersionSpecifier('2.0.0-beta.1')).toBe('beta');
		});
		test('1.0.0-beta.10 should return beta', () => {
			expect(getCliVersionSpecifier('1.0.0-beta.10')).toBe('beta');
		});
		test('2.0.0-rc.1 should return rc', () => {
			expect(getCliVersionSpecifier('2.0.0-rc.1')).toBe('rc');
		});
		test('1.0.0-canary.3 should return canary', () => {
			expect(getCliVersionSpecifier('1.0.0-canary.3')).toBe('canary');
		});
		test('2.0.0-next.5 should return next', () => {
			expect(getCliVersionSpecifier('2.0.0-next.5')).toBe('next');
		});
	});

	describe('stable versions use exact version', () => {
		test('1.0.0 should return exact version', () => {
			expect(getCliVersionSpecifier('1.0.0')).toBe('1.0.0');
		});
		test('1.0.62 should return exact version', () => {
			expect(getCliVersionSpecifier('1.0.62')).toBe('1.0.62');
		});
		test('2.0.0 should return exact version', () => {
			expect(getCliVersionSpecifier('2.0.0')).toBe('2.0.0');
		});
		test('2.0.2 should return exact version', () => {
			expect(getCliVersionSpecifier('2.0.2')).toBe('2.0.2');
		});
		test('10.20.30 should return exact version', () => {
			expect(getCliVersionSpecifier('10.20.30')).toBe('10.20.30');
		});
	});
});
