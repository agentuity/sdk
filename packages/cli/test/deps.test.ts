import { describe, test, expect } from 'bun:test';
import {
	parseBunPmLsOutput,
	parseBunLockFile,
	resolveAliases,
	type PackageRef,
	type AliasMap,
} from '../src/utils/deps.ts';
import { createMockLogger } from '@agentuity/test-utils';

const mockLogger = createMockLogger();

describe('deps', () => {
	describe('parseBunPmLsOutput', () => {
		test('parses simple bun pm ls output', () => {
			const output = `test-project@1.0.0 /path/to/project
├── lodash@4.17.21
├── express@4.18.2
└── typescript@5.3.3
`;
			const result = parseBunPmLsOutput(output);

			expect(result).toContainEqual({ name: 'lodash', version: '4.17.21' });
			expect(result).toContainEqual({ name: 'express', version: '4.18.2' });
			expect(result).toContainEqual({ name: 'typescript', version: '5.3.3' });
		});

		test('parses scoped packages', () => {
			const output = `test-project@1.0.0 /path/to/project
├── @types/node@20.10.0
├── @agentuity/core@1.0.0
└── @scope/package@2.5.3
`;
			const result = parseBunPmLsOutput(output);

			expect(result).toContainEqual({ name: '@types/node', version: '20.10.0' });
			expect(result).toContainEqual({ name: '@agentuity/core', version: '1.0.0' });
			expect(result).toContainEqual({ name: '@scope/package', version: '2.5.3' });
		});

		test('parses nested dependencies', () => {
			const output = `test-project@1.0.0 /path/to/project
├── express@4.18.2
│   ├── accepts@1.3.8
│   │   └── mime-types@2.1.35
│   ├── body-parser@1.20.1
│   └── cookie@0.5.0
└── lodash@4.17.21
`;
			const result = parseBunPmLsOutput(output);

			expect(result).toContainEqual({ name: 'express', version: '4.18.2' });
			expect(result).toContainEqual({ name: 'accepts', version: '1.3.8' });
			expect(result).toContainEqual({ name: 'mime-types', version: '2.1.35' });
			expect(result).toContainEqual({ name: 'body-parser', version: '1.20.1' });
			expect(result).toContainEqual({ name: 'cookie', version: '0.5.0' });
			expect(result).toContainEqual({ name: 'lodash', version: '4.17.21' });
		});

		test('deduplicates packages with same name and version', () => {
			const output = `test-project@1.0.0 /path/to/project
├── lodash@4.17.21
├── express@4.18.2
│   └── lodash@4.17.21
└── other@1.0.0
    └── lodash@4.17.21
`;
			const result = parseBunPmLsOutput(output);

			const lodashEntries = result.filter((p) => p.name === 'lodash');
			expect(lodashEntries.length).toBe(1);
			expect(lodashEntries[0]).toEqual({ name: 'lodash', version: '4.17.21' });
		});

		test('handles prerelease versions', () => {
			const output = `test-project@1.0.0 /path/to/project
├── package-a@1.0.0-alpha.1
├── package-b@2.0.0-beta
└── package-c@3.0.0-rc.2
`;
			const result = parseBunPmLsOutput(output);

			expect(result).toContainEqual({ name: 'package-a', version: '1.0.0-alpha.1' });
			expect(result).toContainEqual({ name: 'package-b', version: '2.0.0-beta' });
			expect(result).toContainEqual({ name: 'package-c', version: '3.0.0-rc.2' });
		});

		test('handles empty output', () => {
			const output = '';
			const result = parseBunPmLsOutput(output);
			expect(result).toEqual([]);
		});

		test('handles output with only project name', () => {
			const output = `test-project@1.0.0 /path/to/project
`;
			const result = parseBunPmLsOutput(output);
			expect(result).toContainEqual({ name: 'test-project', version: '1.0.0' });
		});

		test('ignores lines without version pattern', () => {
			const output = `test-project@1.0.0 /path/to/project
├── some-package without version
├── lodash@4.17.21
└── invalid line here
`;
			const result = parseBunPmLsOutput(output);

			expect(result).toContainEqual({ name: 'lodash', version: '4.17.21' });
			expect(result.length).toBe(2); // project + lodash
		});

		test('handles real bun pm ls --all output format', () => {
			const output = `my-app@0.1.0 /Users/dev/my-app
├── @agentuity/cli@0.1.24
├── @agentuity/core@0.1.24
├── @agentuity/runtime@0.1.24
│   ├── @hono/zod-validator@0.4.3
│   │   └── hono@4.7.10
│   ├── hono@4.7.10
│   └── zod@3.24.4
├── @agentuity/server@0.1.24
│   └── zod@3.24.4
└── typescript@5.8.3
`;
			const result = parseBunPmLsOutput(output);

			expect(result).toContainEqual({ name: '@agentuity/cli', version: '0.1.24' });
			expect(result).toContainEqual({ name: '@agentuity/core', version: '0.1.24' });
			expect(result).toContainEqual({ name: '@agentuity/runtime', version: '0.1.24' });
			expect(result).toContainEqual({ name: '@hono/zod-validator', version: '0.4.3' });
			expect(result).toContainEqual({ name: 'hono', version: '4.7.10' });
			expect(result).toContainEqual({ name: 'zod', version: '3.24.4' });
			expect(result).toContainEqual({ name: 'typescript', version: '5.8.3' });

			// Should deduplicate hono and zod
			const honoEntries = result.filter((p) => p.name === 'hono');
			expect(honoEntries.length).toBe(1);

			const zodEntries = result.filter((p) => p.name === 'zod');
			expect(zodEntries.length).toBe(1);
		});

		test('handles different version formats correctly', () => {
			const testCases: Array<{ input: string; expected: PackageRef }> = [
				{ input: 'pkg@1.0.0', expected: { name: 'pkg', version: '1.0.0' } },
				{ input: 'pkg@10.20.30', expected: { name: 'pkg', version: '10.20.30' } },
				{ input: '@scope/pkg@1.2.3', expected: { name: '@scope/pkg', version: '1.2.3' } },
				{
					input: '@org/name@0.0.1-alpha',
					expected: { name: '@org/name', version: '0.0.1-alpha' },
				},
			];

			for (const { input, expected } of testCases) {
				const result = parseBunPmLsOutput(input);
				expect(result).toContainEqual(expected);
			}
		});
	});

	describe('package detection scenarios', () => {
		test('detects malware package in dependencies', () => {
			const output = `my-app@1.0.0 /path/to/app
├── evil-package@1.0.0
├── lodash@4.17.21
└── express@4.18.2
`;
			const result = parseBunPmLsOutput(output);

			const hasEvilPackage = result.some(
				(p) => p.name === 'evil-package' && p.version === '1.0.0'
			);
			expect(hasEvilPackage).toBe(true);
		});

		test('detects malware package in transitive dependencies', () => {
			const output = `my-app@1.0.0 /path/to/app
├── safe-wrapper@2.0.0
│   └── evil-package@1.0.0
└── lodash@4.17.21
`;
			const result = parseBunPmLsOutput(output);

			const hasEvilPackage = result.some(
				(p) => p.name === 'evil-package' && p.version === '1.0.0'
			);
			expect(hasEvilPackage).toBe(true);
		});

		test('handles large dependency trees', () => {
			const lines = ['big-project@1.0.0 /path/to/project'];
			for (let i = 0; i < 1000; i++) {
				lines.push(`├── package-${i}@${i}.0.0`);
			}
			const output = lines.join('\n');

			const result = parseBunPmLsOutput(output);

			expect(result.length).toBe(1001); // project + 1000 packages
			expect(result).toContainEqual({ name: 'package-0', version: '0.0.0' });
			expect(result).toContainEqual({ name: 'package-999', version: '999.0.0' });
		});
	});

	describe('parseBunLockFile', () => {
		test('parses valid bun.lock with packages', () => {
			const content = JSON.stringify({
				lockfileVersion: 1,
				packages: {
					lodash: ['lodash@4.17.21', '', {}, 'sha512-...'],
					express: ['express@4.18.2', '', {}, 'sha512-...'],
				},
			});

			const result = parseBunLockFile(content);

			expect(result).not.toBeNull();
			expect(result?.lockfileVersion).toBe(1);
			expect(result?.packages).toBeDefined();
			expect(result?.packages?.lodash).toBeDefined();
			expect(result?.packages?.express).toBeDefined();
		});

		test('parses bun.lock with npm aliases', () => {
			const content = JSON.stringify({
				lockfileVersion: 1,
				packages: {
					'tailwind-merge-v2': ['tailwind-merge@2.6.0', '', {}, 'sha512-...'],
					'tailwind-merge-v3': ['tailwind-merge@3.0.1', '', {}, 'sha512-...'],
					lodash: ['lodash@4.17.21', '', {}, 'sha512-...'],
				},
			});

			const result = parseBunLockFile(content);

			expect(result).not.toBeNull();
			expect(result?.packages?.['tailwind-merge-v2']?.[0]).toBe('tailwind-merge@2.6.0');
			expect(result?.packages?.['tailwind-merge-v3']?.[0]).toBe('tailwind-merge@3.0.1');
		});

		test('returns null for invalid JSON', () => {
			const content = 'not valid json {{{';
			const result = parseBunLockFile(content);
			expect(result).toBeNull();
		});

		test('returns null for empty string', () => {
			const result = parseBunLockFile('');
			expect(result).toBeNull();
		});

		test('handles bun.lock without packages field', () => {
			const content = JSON.stringify({
				lockfileVersion: 1,
			});

			const result = parseBunLockFile(content);

			expect(result).not.toBeNull();
			expect(result?.packages).toBeUndefined();
		});

		test('handles bun.lock with trailing commas (JSONC format)', () => {
			// Real bun.lock files use JSONC format with trailing commas
			const content = `{
  "lockfileVersion": 1,
  "packages": {
    "lodash": ["lodash@4.17.21", "", {}, "sha512-..."],
    "tailwind-merge-v2": ["tailwind-merge@2.6.0", "", {}, "sha512-..."],
  },
}`;

			const result = parseBunLockFile(content);

			expect(result).not.toBeNull();
			expect(result?.lockfileVersion).toBe(1);
			expect(result?.packages?.lodash).toBeDefined();
			expect(result?.packages?.['tailwind-merge-v2']?.[0]).toBe('tailwind-merge@2.6.0');
		});

		test('handles complex bun.lock with nested trailing commas', () => {
			const content = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "dependencies": {
        "lodash": "4.17.21",
        "tailwind-merge-v2": "npm:tailwind-merge@2.6.0",
      },
    },
  },
  "packages": {
    "lodash": ["lodash@4.17.21", "", {}, "sha512-..."],
    "tailwind-merge-v2": ["tailwind-merge@2.6.0", "", {}, "sha512-..."],
  },
}`;

			const result = parseBunLockFile(content);

			expect(result).not.toBeNull();
			expect(result?.packages?.lodash).toBeDefined();
			expect(result?.packages?.['tailwind-merge-v2']).toBeDefined();
		});
	});

	describe('resolveAliases', () => {
		test('resolves simple npm alias to actual package name', () => {
			const packages: PackageRef[] = [
				{ name: 'tailwind-merge-v2', version: '2.6.0' },
				{ name: 'lodash', version: '4.17.21' },
			];

			const aliasMap: AliasMap = new Map([
				['tailwind-merge-v2@2.6.0', { name: 'tailwind-merge', version: '2.6.0' }],
			]);

			const result = resolveAliases(packages, aliasMap, mockLogger);

			expect(result).toContainEqual({ name: 'tailwind-merge', version: '2.6.0' });
			expect(result).toContainEqual({ name: 'lodash', version: '4.17.21' });
			expect(result.find((p) => p.name === 'tailwind-merge-v2')).toBeUndefined();
		});

		test('resolves multiple npm aliases', () => {
			const packages: PackageRef[] = [
				{ name: 'tailwind-merge-v2', version: '2.6.0' },
				{ name: 'tailwind-merge-v3', version: '3.0.1' },
				{ name: 'lodash', version: '4.17.21' },
			];

			const aliasMap: AliasMap = new Map([
				['tailwind-merge-v2@2.6.0', { name: 'tailwind-merge', version: '2.6.0' }],
				['tailwind-merge-v3@3.0.1', { name: 'tailwind-merge', version: '3.0.1' }],
			]);

			const result = resolveAliases(packages, aliasMap, mockLogger);

			expect(result).toContainEqual({ name: 'tailwind-merge', version: '2.6.0' });
			expect(result).toContainEqual({ name: 'tailwind-merge', version: '3.0.1' });
			expect(result).toContainEqual({ name: 'lodash', version: '4.17.21' });
			expect(result.find((p) => p.name === 'tailwind-merge-v2')).toBeUndefined();
			expect(result.find((p) => p.name === 'tailwind-merge-v3')).toBeUndefined();
		});

		test('keeps non-aliased packages unchanged', () => {
			const packages: PackageRef[] = [
				{ name: 'lodash', version: '4.17.21' },
				{ name: 'express', version: '4.18.2' },
			];

			const aliasMap: AliasMap = new Map();

			const result = resolveAliases(packages, aliasMap, mockLogger);

			expect(result).toEqual(packages);
		});

		test('handles scoped package aliases', () => {
			const packages: PackageRef[] = [
				{ name: '@my-alias/utils', version: '1.0.0' },
				{ name: 'lodash', version: '4.17.21' },
			];

			const aliasMap: AliasMap = new Map([
				['@my-alias/utils@1.0.0', { name: '@actual/utils', version: '1.0.0' }],
			]);

			const result = resolveAliases(packages, aliasMap, mockLogger);

			expect(result).toContainEqual({ name: '@actual/utils', version: '1.0.0' });
			expect(result).toContainEqual({ name: 'lodash', version: '4.17.21' });
			expect(result.find((p) => p.name === '@my-alias/utils')).toBeUndefined();
		});

		test('deduplicates when alias resolves to existing package', () => {
			const packages: PackageRef[] = [
				{ name: 'tailwind-merge-v2', version: '2.6.0' },
				{ name: 'tailwind-merge', version: '2.6.0' }, // Already have the actual package
			];

			const aliasMap: AliasMap = new Map([
				['tailwind-merge-v2@2.6.0', { name: 'tailwind-merge', version: '2.6.0' }],
			]);

			const result = resolveAliases(packages, aliasMap, mockLogger);

			const tailwindMergeEntries = result.filter((p) => p.name === 'tailwind-merge');
			expect(tailwindMergeEntries.length).toBe(1);
			expect(tailwindMergeEntries[0]).toEqual({ name: 'tailwind-merge', version: '2.6.0' });
		});

		test('handles empty package list', () => {
			const packages: PackageRef[] = [];
			const aliasMap: AliasMap = new Map([
				['tailwind-merge-v2@2.6.0', { name: 'tailwind-merge', version: '2.6.0' }],
			]);

			const result = resolveAliases(packages, aliasMap, mockLogger);

			expect(result).toEqual([]);
		});

		test('handles empty alias map', () => {
			const packages: PackageRef[] = [
				{ name: 'lodash', version: '4.17.21' },
				{ name: 'express', version: '4.18.2' },
			];

			const aliasMap: AliasMap = new Map();

			const result = resolveAliases(packages, aliasMap, mockLogger);

			expect(result).toEqual(packages);
		});
	});

	describe('npm alias scenarios (issue #805)', () => {
		test('flowbite-react tailwind-merge aliases are resolved correctly', () => {
			// This is the exact scenario from the issue
			const packages: PackageRef[] = [
				{ name: 'flowbite-react', version: '0.12.16' },
				{ name: 'tailwind-merge-v2', version: '2.6.0' },
				{ name: 'tailwind-merge-v3', version: '3.0.1' },
				{ name: 'react', version: '18.2.0' },
			];

			const aliasMap: AliasMap = new Map([
				['tailwind-merge-v2@2.6.0', { name: 'tailwind-merge', version: '2.6.0' }],
				['tailwind-merge-v3@3.0.1', { name: 'tailwind-merge', version: '3.0.1' }],
			]);

			const result = resolveAliases(packages, aliasMap, mockLogger);

			// Should have tailwind-merge (both versions), flowbite-react, and react
			expect(result).toContainEqual({ name: 'tailwind-merge', version: '2.6.0' });
			expect(result).toContainEqual({ name: 'tailwind-merge', version: '3.0.1' });
			expect(result).toContainEqual({ name: 'flowbite-react', version: '0.12.16' });
			expect(result).toContainEqual({ name: 'react', version: '18.2.0' });

			// Should NOT have the alias names
			expect(result.find((p) => p.name === 'tailwind-merge-v2')).toBeUndefined();
			expect(result.find((p) => p.name === 'tailwind-merge-v3')).toBeUndefined();
		});

		test('string-width-cjs alias pattern is resolved correctly', () => {
			// Another common npm alias pattern from @isaacs/cliui
			const packages: PackageRef[] = [
				{ name: 'string-width-cjs', version: '4.2.3' },
				{ name: 'strip-ansi-cjs', version: '6.0.1' },
				{ name: 'wrap-ansi-cjs', version: '7.0.0' },
			];

			const aliasMap: AliasMap = new Map([
				['string-width-cjs@4.2.3', { name: 'string-width', version: '4.2.3' }],
				['strip-ansi-cjs@6.0.1', { name: 'strip-ansi', version: '6.0.1' }],
				['wrap-ansi-cjs@7.0.0', { name: 'wrap-ansi', version: '7.0.0' }],
			]);

			const result = resolveAliases(packages, aliasMap, mockLogger);

			expect(result).toContainEqual({ name: 'string-width', version: '4.2.3' });
			expect(result).toContainEqual({ name: 'strip-ansi', version: '6.0.1' });
			expect(result).toContainEqual({ name: 'wrap-ansi', version: '7.0.0' });

			// Should NOT have the alias names
			expect(result.find((p) => p.name === 'string-width-cjs')).toBeUndefined();
			expect(result.find((p) => p.name === 'strip-ansi-cjs')).toBeUndefined();
			expect(result.find((p) => p.name === 'wrap-ansi-cjs')).toBeUndefined();
		});
	});
});
