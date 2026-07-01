import { describe, test, expect } from 'bun:test';
import { getIONHost } from '../src/config';

/**
 * Generates a project identifier from a project ID using xxHash64.
 * The identifier is always 16 hex characters (zero-padded).
 *
 * This must match the implementation in src/domain.ts
 */
function generateProjectIdentifier(projectId: string): string {
	return Bun.hash.xxHash64(projectId).toString(16).padStart(16, '0');
}

describe('domain DNS validation', () => {
	describe('project identifier generation', () => {
		test('generates 16-character hex identifier', () => {
			const projectId = 'proj_test123';
			const identifier = generateProjectIdentifier(projectId);

			expect(identifier).toHaveLength(16);
			expect(identifier).toMatch(/^[0-9a-f]{16}$/);
		});

		test('preserves leading zeros in identifier', () => {
			// This project ID is known to produce a hash with a leading zero
			const projectId = 'proj_81766c4548fe4766c06b90db086527b4';
			const identifier = generateProjectIdentifier(projectId);

			expect(identifier).toBe('0a21231341cdb560');
			expect(identifier).toHaveLength(16);
			expect(identifier[0]).toBe('0'); // Leading zero must be preserved
		});

		test('generates consistent identifiers', () => {
			const projectId = 'proj_abc123';
			const id1 = generateProjectIdentifier(projectId);
			const id2 = generateProjectIdentifier(projectId);

			expect(id1).toBe(id2);
		});

		test('generates different identifiers for different projects', () => {
			const id1 = generateProjectIdentifier('proj_abc');
			const id2 = generateProjectIdentifier('proj_xyz');

			expect(id1).not.toBe(id2);
		});

		test('handles edge case where hash would have multiple leading zeros', () => {
			// Test that padding works correctly for any number of leading zeros
			// We simulate this by checking the padStart behavior
			const shortHex = 'abc'; // 3 chars
			const padded = shortHex.padStart(16, '0');

			expect(padded).toBe('0000000000000abc');
			expect(padded).toHaveLength(16);
		});
	});

	describe('CNAME target generation', () => {
		test('generates correct CNAME target for production', () => {
			const projectId = 'proj_81766c4548fe4766c06b90db086527b4';
			const identifier = generateProjectIdentifier(projectId);
			const suffix = 'agentuity.run';
			const proxy = `p${identifier}.${suffix}`;

			expect(proxy).toBe('p0a21231341cdb560.agentuity.run');
		});

		test('generates correct CNAME target for local development', () => {
			const projectId = 'proj_81766c4548fe4766c06b90db086527b4';
			const identifier = generateProjectIdentifier(projectId);
			const suffix = 'agentuity.io';
			const proxy = `p${identifier}.${suffix}`;

			expect(proxy).toBe('p0a21231341cdb560.agentuity.io');
		});
	});

	describe('ION host A record target', () => {
		test('generates correct ION hostname for production regions', () => {
			expect(getIONHost(null, 'use')).toBe('ion-use.agentuity.cloud');
			expect(getIONHost(null, 'euw')).toBe('ion-euw.agentuity.cloud');
		});

		test('generates ION hostname for local development', () => {
			expect(getIONHost({ name: 'local' } as Parameters<typeof getIONHost>[0], 'local')).toBe(
				'ion.agentuity.io'
			);
		});

		test('throws on empty region', () => {
			expect(() => getIONHost(null, '')).toThrow();
		});
	});
});
