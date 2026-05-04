/**
 * Direct tests for the catalog's resolveSelection helper. Covers the
 * cases the CLI's --services flag relies on: unknown ids throw,
 * transitive requires get auto-included, output order matches catalog
 * order regardless of input order.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadCatalog, resolveSelection } from '../src/cmd/project/services-catalog';

const servicesDir = join(__dirname, '..', 'src', 'cmd', 'project', 'templates', 'services');
const catalog = loadCatalog(servicesDir);

describe('resolveSelection', () => {
	test('returns empty for no input', () => {
		expect(resolveSelection([], catalog)).toEqual([]);
	});

	test('throws on unknown service id', () => {
		expect(() => resolveSelection(['nope'], catalog)).toThrow(/Unknown service/);
	});

	test('preserves all selected ids', () => {
		const ids = resolveSelection(['db', 'queue'], catalog).map((s) => s.id);
		expect(ids).toContain('db');
		expect(ids).toContain('queue');
	});

	test('storage auto-pulls db', () => {
		const ids = resolveSelection(['storage'], catalog).map((s) => s.id);
		expect(ids).toContain('db');
		expect(ids).toContain('storage');
	});

	test('output is in catalog order regardless of input order', () => {
		// keyvalue=10, db=20, vector=30, queue=40, storage=50
		const a = resolveSelection(['storage', 'queue', 'keyvalue'], catalog).map((s) => s.id);
		const b = resolveSelection(['keyvalue', 'queue', 'storage'], catalog).map((s) => s.id);
		expect(a).toEqual(b);
		// And specifically: keyvalue first, then db (auto), then queue, then storage.
		expect(a.indexOf('keyvalue')).toBeLessThan(a.indexOf('queue'));
		expect(a.indexOf('db')).toBeLessThan(a.indexOf('storage'));
	});

	test('selecting all five gives all five in catalog order', () => {
		const ids = resolveSelection(['queue', 'vector', 'storage', 'keyvalue', 'db'], catalog).map(
			(s) => s.id
		);
		expect(ids).toEqual(['keyvalue', 'db', 'vector', 'queue', 'storage']);
	});
});
