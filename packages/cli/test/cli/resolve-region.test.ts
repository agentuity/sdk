import { describe, expect, test } from 'bun:test';
import type { Logger } from '@agentuity/core';
import type { RegionList } from '@agentuity/server';
import { resolveRegion } from '../../src/cli';

const noopLogger: Logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: () => {},
	child: () => noopLogger,
} as unknown as Logger;

const regions: RegionList = [
	{ region: 'usc', description: 'US Central' },
	{ region: 'use', description: 'US East' },
	{ region: 'euw', description: 'EU West' },
] as unknown as RegionList;

describe('resolveRegion', () => {
	test('project region beats saved preference when both are valid', async () => {
		const result = await resolveRegion({
			options: {},
			regions,
			logger: noopLogger,
			required: true,
			region: 'use', // project lives in use
			config: { preferences: { region: 'usc' } } as never, // user preference is usc
		});
		expect(result).toBe('use');
	});

	test('--region flag still wins over project region', async () => {
		const result = await resolveRegion({
			options: { region: 'euw' },
			regions,
			logger: noopLogger,
			required: true,
			region: 'use',
			config: { preferences: { region: 'usc' } } as never,
		});
		expect(result).toBe('euw');
	});

	test('saved preference is used when no project region is provided (non-TTY)', async () => {
		const result = await resolveRegion({
			options: {},
			regions,
			logger: noopLogger,
			required: true,
			config: { preferences: { region: 'usc' } } as never,
		});
		// In a non-TTY test env, the preference path returns directly without prompting.
		expect(result).toBe('usc');
	});

	test('falls back to project region when preference is invalid', async () => {
		const result = await resolveRegion({
			options: {},
			regions,
			logger: noopLogger,
			required: true,
			region: 'use',
			config: { preferences: { region: 'unknown' } } as never,
		});
		expect(result).toBe('use');
	});
});
