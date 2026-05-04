/**
 * Sanity-check tests for the bundled services catalog. The catalog is
 * loaded from real templates/services/<id>/manifest.json files, so
 * these tests fail loudly when a manifest is malformed, has a stale
 * `requires` reference, or duplicates an order value.
 *
 * Empty directory is acceptable (returns []), so these tests only
 * assert invariants that should hold for any non-empty catalog.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadCatalog, resolveSelection } from '../src/cmd/project/services-catalog';

const servicesDir = join(__dirname, '..', 'src', 'cmd', 'project', 'templates', 'services');

describe('services catalog', () => {
	test('catalog loads without throwing', () => {
		expect(() => loadCatalog(servicesDir)).not.toThrow();
	});

	test('every catalog entry has a unique id', () => {
		const cat = loadCatalog(servicesDir);
		const ids = cat.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test('every catalog entry has a unique order', () => {
		const cat = loadCatalog(servicesDir);
		if (cat.length < 2) return;
		const orders = cat.map((s) => s.order);
		expect(new Set(orders).size).toBe(orders.length);
	});

	test('catalog is sorted ascending by order', () => {
		const cat = loadCatalog(servicesDir);
		for (let i = 1; i < cat.length; i++) {
			expect(cat[i]!.order).toBeGreaterThan(cat[i - 1]!.order);
		}
	});

	test('every requires reference resolves to a known service', () => {
		const cat = loadCatalog(servicesDir);
		const ids = new Set(cat.map((s) => s.id));
		for (const s of cat) {
			for (const dep of s.requires ?? []) {
				expect(ids.has(dep)).toBe(true);
			}
		}
	});

	test('resolveSelection of every id individually expands without error', () => {
		const cat = loadCatalog(servicesDir);
		for (const s of cat) {
			expect(() => resolveSelection([s.id], cat)).not.toThrow();
		}
	});
});
