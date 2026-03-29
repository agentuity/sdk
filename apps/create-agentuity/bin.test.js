#!/usr/bin/env bun test
import { describe, test, expect } from 'bun:test';
import { getCliVersionSpecifier } from './bin.js';

describe('getCliVersionSpecifier', () => {
	describe('beta versions', () => {
		test('2.0.0-beta.0 should return beta', () => {
			expect(getCliVersionSpecifier('2.0.0-beta.0')).toBe('beta');
		});
		test('2.0.0-beta.1 should return beta', () => {
			expect(getCliVersionSpecifier('2.0.0-beta.1')).toBe('beta');
		});
		test('1.0.0-beta.10 should return beta', () => {
			expect(getCliVersionSpecifier('1.0.0-beta.10')).toBe('beta');
		});
	});

	describe('other prerelease versions', () => {
		test('2.0.0-alpha.0 should return next', () => {
			expect(getCliVersionSpecifier('2.0.0-alpha.0')).toBe('next');
		});
		test('2.0.0-rc.1 should return next', () => {
			expect(getCliVersionSpecifier('2.0.0-rc.1')).toBe('next');
		});
		test('1.0.0-canary.3 should return next', () => {
			expect(getCliVersionSpecifier('1.0.0-canary.3')).toBe('next');
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
