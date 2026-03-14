import { describe, expect, test } from 'bun:test';
import {
	extractPiVersion,
	isSupportedPiVersion,
	SUPPORTED_PI_VERSION_RANGE,
} from '../src/cmd/coder/pi-version';

describe('pi version support', () => {
	test('extracts a version from pi --version output', () => {
		expect(extractPiVersion('pi 0.58.1')).toBe('0.58.1');
		expect(extractPiVersion('v0.58.1')).toBe('0.58.1');
		expect(extractPiVersion('pi-coding-agent version 0.58.1\n')).toBe('0.58.1');
	});

	test('returns null when no semver is present', () => {
		expect(extractPiVersion('pi dev build')).toBeNull();
		expect(extractPiVersion('')).toBeNull();
	});

	test('matches the current supported range', () => {
		expect(SUPPORTED_PI_VERSION_RANGE).toBe('>=0.58.1 <0.59.0');
		expect(isSupportedPiVersion('0.58.1')).toBe(true);
		expect(isSupportedPiVersion('0.58.7')).toBe(true);
		expect(isSupportedPiVersion('0.58.0')).toBe(false);
		expect(isSupportedPiVersion('0.59.0')).toBe(false);
	});
});
