import { describe, test, expect } from 'bun:test';
import { getAdapter } from '../../../../src/cmd/build/adapters';
import type { FrameworkName } from '../../../../src/cmd/build/detect/types';

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

	test('all framework names return a valid adapter', () => {
		const frameworks: FrameworkName[] = [
			'agentuity',
			'nextjs',
			'vite',
			'sveltekit',
			'astro',
			'nuxt',
			'remix',
			'generic',
		];

		for (const name of frameworks) {
			const adapter = getAdapter(name);
			expect(adapter).toBeDefined();
			expect(typeof adapter.build).toBe('function');
			expect(typeof adapter.name).toBe('string');
		}
	});
});
