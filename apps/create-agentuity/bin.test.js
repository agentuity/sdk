#!/usr/bin/env bun test
import { describe, test, expect } from 'bun:test';

// Copy of the getDistTag function from bin.js for testing
function getDistTag(version) {
	// Check for beta prerelease first
	if (/-beta\./.test(version)) {
		return 'beta';
	}
	// Check for other prerelease identifiers: alpha, rc, canary, next, etc.
	if (/-([a-zA-Z]+)/.test(version)) {
		return 'next';
	}
	return 'latest';
}

describe('getDistTag', () => {
	describe('beta versions', () => {
		test('2.0.0-beta.0 should return beta', () => {
			expect(getDistTag('2.0.0-beta.0')).toBe('beta');
		});
		test('2.0.0-beta.1 should return beta', () => {
			expect(getDistTag('2.0.0-beta.1')).toBe('beta');
		});
		test('1.0.0-beta.10 should return beta', () => {
			expect(getDistTag('1.0.0-beta.10')).toBe('beta');
		});
	});

	describe('other prerelease versions', () => {
		test('2.0.0-alpha.0 should return next', () => {
			expect(getDistTag('2.0.0-alpha.0')).toBe('next');
		});
		test('2.0.0-rc.1 should return next', () => {
			expect(getDistTag('2.0.0-rc.1')).toBe('next');
		});
		test('1.0.0-canary.3 should return next', () => {
			expect(getDistTag('1.0.0-canary.3')).toBe('next');
		});
		test('2.0.0-next.5 should return next', () => {
			expect(getDistTag('2.0.0-next.5')).toBe('next');
		});
	});

	describe('stable versions', () => {
		test('1.0.0 should return latest', () => {
			expect(getDistTag('1.0.0')).toBe('latest');
		});
		test('1.0.62 should return latest', () => {
			expect(getDistTag('1.0.62')).toBe('latest');
		});
		test('2.0.0 should return latest', () => {
			expect(getDistTag('2.0.0')).toBe('latest');
		});
		test('10.20.30 should return latest', () => {
			expect(getDistTag('10.20.30')).toBe('latest');
		});
	});
});
