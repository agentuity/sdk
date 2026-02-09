import { describe, test, expect } from 'bun:test';
import { resolveDomains, DEFAULT_BRANCHES } from '../src/domain';

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
});

describe('resolveDomains', () => {
	describe('backward compatibility (flat array)', () => {
		test('returns empty array when domains is undefined', () => {
			expect(resolveDomains(undefined, 'main')).toEqual([]);
		});

		test('returns empty array when domains is empty array', () => {
			expect(resolveDomains([], 'main')).toEqual([]);
		});

		test('returns the array as-is when domains is a flat string[]', () => {
			const domains = ['example.com', 'app.example.com'];
			expect(resolveDomains(domains, 'main')).toEqual(['example.com', 'app.example.com']);
		});
	});

	describe('branch-keyed map — exact match', () => {
		test('returns domains for exact branch match "staging"', () => {
			const domains = {
				'*': ['prod.example.com'],
				staging: ['staging.example.com'],
			};
			expect(resolveDomains(domains, 'staging')).toEqual(['staging.example.com']);
		});

		test('returns domains for exact branch match "dev"', () => {
			const domains = {
				'*': ['prod.example.com'],
				dev: ['dev.example.com'],
			};
			expect(resolveDomains(domains, 'dev')).toEqual(['dev.example.com']);
		});
	});

	describe('branch-keyed map — wildcard * matching', () => {
		test('returns * domains when branch is "main"', () => {
			const domains = { '*': ['prod.example.com'] };
			expect(resolveDomains(domains, 'main')).toEqual(['prod.example.com']);
		});

		test('returns * domains when branch is "master"', () => {
			const domains = { '*': ['prod.example.com'] };
			expect(resolveDomains(domains, 'master')).toEqual(['prod.example.com']);
		});

		test('returns * domains when branch is null (no branch detected)', () => {
			const domains = { '*': ['prod.example.com'] };
			expect(resolveDomains(domains, null)).toEqual(['prod.example.com']);
		});

		test('does NOT return * domains when branch is a non-default branch', () => {
			const domains = { '*': ['prod.example.com'] };
			expect(resolveDomains(domains, 'feature/foo')).toEqual([]);
		});
	});

	describe('branch-keyed map — precedence', () => {
		test('exact match takes precedence over *', () => {
			const domains = {
				'*': ['wildcard.example.com'],
				main: ['main.example.com'],
			};
			expect(resolveDomains(domains, 'main')).toEqual(['main.example.com']);
		});
	});

	describe('branch-keyed map — no match', () => {
		test('returns empty array when branch does not match any key and no * key exists', () => {
			const domains = {
				staging: ['staging.example.com'],
				dev: ['dev.example.com'],
			};
			expect(resolveDomains(domains, 'feature/bar')).toEqual([]);
		});

		test('returns empty array when deploying from non-default branch with only *, staging, dev keys', () => {
			const domains = {
				'*': ['prod.example.com'],
				staging: ['staging.example.com'],
				dev: ['dev.example.com'],
			};
			expect(resolveDomains(domains, 'feature/foo')).toEqual([]);
		});
	});

	describe('edge cases', () => {
		test('map with empty arrays as values returns empty array for matched branch', () => {
			const domains = {
				staging: [] as string[],
			};
			expect(resolveDomains(domains, 'staging')).toEqual([]);
		});

		test('single branch key with no * key works correctly', () => {
			const domains = {
				production: ['prod.example.com'],
			};
			expect(resolveDomains(domains, 'production')).toEqual(['prod.example.com']);
			expect(resolveDomains(domains, 'main')).toEqual([]);
		});
	});

	describe('DEFAULT_BRANCHES constant', () => {
		test('contains "main" and "master"', () => {
			expect(DEFAULT_BRANCHES).toContain('main');
			expect(DEFAULT_BRANCHES).toContain('master');
		});
	});
});
