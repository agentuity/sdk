import { describe, test, expect } from 'bun:test';
import { getAdapter } from '../../../../src/cmd/build/adapters';

describe('Adapter Registry', () => {
	test('returns agentuity adapter for agentuity framework', () => {
		const adapter = getAdapter('agentuity');
		expect(adapter.name).toBe('agentuity');
	});

	test('returns nextjs adapter for nextjs framework', () => {
		const adapter = getAdapter('nextjs');
		expect(adapter.name).toBe('nextjs');
	});

	test('returns generic adapter for vite (no specific adapter)', () => {
		const adapter = getAdapter('vite');
		expect(adapter.name).toBe('generic');
	});

	test('returns generic adapter for sveltekit (no specific adapter yet)', () => {
		const adapter = getAdapter('sveltekit');
		expect(adapter.name).toBe('generic');
	});

	test('returns generic adapter for nuxt', () => {
		const adapter = getAdapter('nuxt');
		expect(adapter.name).toBe('generic');
	});

	test('returns generic adapter for remix', () => {
		const adapter = getAdapter('remix');
		expect(adapter.name).toBe('generic');
	});

	test('returns generic adapter for astro', () => {
		const adapter = getAdapter('astro');
		expect(adapter.name).toBe('generic');
	});

	test('returns generic adapter for generic', () => {
		const adapter = getAdapter('generic');
		expect(adapter.name).toBe('generic');
	});

	test('returns generic adapter for unknown framework slug', () => {
		const adapter = getAdapter('some-unknown-framework');
		expect(adapter.name).toBe('generic');
	});

	test('all known framework adapters have a build function', () => {
		const slugs = [
			'agentuity',
			'nextjs',
			'vite',
			'sveltekit',
			'astro',
			'nuxt',
			'remix',
			'react-router',
			'solidstart',
			'tanstack-start',
			'generic',
		];

		for (const slug of slugs) {
			const adapter = getAdapter(slug);
			expect(adapter).toBeDefined();
			expect(typeof adapter.build).toBe('function');
			expect(typeof adapter.name).toBe('string');
		}
	});
});
