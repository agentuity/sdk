import { describe, test, expect } from 'bun:test';
import { parseBunPmLsOutput, type PackageRef } from '../src/utils/deps';

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
});
