import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fixDuplicateExportsInDirectory } from './fix-duplicate-exports';

describe('fix-duplicate-exports', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'fix-duplicate-exports-test-'));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe('export alias syntax preservation', () => {
		test('preserves "qux as baz" when removing duplicate foo', async () => {
			// This is the critical bug case from the feedback
			const code = `export { foo };
export { qux as baz, foo };`;

			const expected = `export { foo };
export { qux as baz };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('preserves "foo as bar" when it is not duplicate', async () => {
			const code = `export { foo as bar };
export { baz };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			// Should not change - no duplicates
			expect(result).toBe(code);
		});

		test('handles multiple aliases in same export statement', async () => {
			const code = `export { foo as bar, baz as qux };
export { bar, simple };`;

			// "bar" is duplicate (exported in both statements)
			const expected = `export { foo as bar, baz as qux };
export { simple };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('preserves alias when removing from middle of export list', async () => {
			const code = `export { alpha, beta };
export { alpha, gamma as delta, epsilon };`;

			const expected = `export { alpha, beta };
export { gamma as delta, epsilon };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('handles exported name being the duplicate (alias target)', async () => {
			const code = `export { foo as bar };
export { bar };`;

			// "bar" from first export and "bar" from second export are DIFFERENT
			// First one exports the identifier "foo" with the name "bar"
			// Second one exports the identifier "bar" with the name "bar"
			// These are duplicates from export name perspective
			const expected = `export { foo as bar };
`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});
	});

	describe('duplicate removal', () => {
		test('removes entire duplicate export statement', async () => {
			const code = `export { foo, bar };
export { foo, bar };`;

			const expected = `export { foo, bar };
`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('removes only duplicate names from partial duplicate', async () => {
			const code = `export { foo, bar };
export { foo, baz };`;

			const expected = `export { foo, bar };
export { baz };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('handles three-way duplicates', async () => {
			const code = `export { foo };
export { bar };
export { foo };`;

			const expected = `export { foo };
export { bar };
`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('preserves non-duplicate exports', async () => {
			const code = `export { foo };
export { bar };
export { baz };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			// Should not change - no duplicates
			expect(result).toBe(code);
		});
	});

	describe('__INVALID__REF__ removal', () => {
		test('removes __INVALID__REF__ at start with comma', async () => {
			const code = `export { __INVALID__REF__, foo, bar };`;
			const expected = `export { foo, bar };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('removes __INVALID__REF__ at end with comma', async () => {
			const code = `export { foo, bar, __INVALID__REF__ };`;
			const expected = `export { foo, bar };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('removes __INVALID__REF__ in middle', async () => {
			const code = `export { foo, __INVALID__REF__, bar };`;
			const expected = `export { foo, bar };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('removes __INVALID__REF__ from imports', async () => {
			const code = `import { __INVALID__REF__, foo } from 'bar';
export { foo };`;

			const expected = `import { foo } from 'bar';
export { foo };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});
	});

	describe('complex scenarios', () => {
		test('handles combination of aliases and duplicates', async () => {
			const code = `export { foo as exportedFoo, bar };
export { baz as exportedBaz };
export { bar, qux };`;

			const expected = `export { foo as exportedFoo, bar };
export { baz as exportedBaz };
export { qux };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('handles whitespace variations', async () => {
			const code = `export { foo };
  export { bar as baz  , foo };`;

			const expected = `export { foo };
export { bar as baz };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('does not modify non-matching export patterns', async () => {
			const code = `export default function foo() {}
export const bar = 1;
export { baz };
export * from './other';`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			// Should only process export { ... } statements
			expect(result).toBe(code);
		});

		test('handles multiple files in directory', async () => {
			const file1 = join(tempDir, 'file1.js');
			const file2 = join(tempDir, 'file2.js');

			await Bun.write(file1, `export { foo };\nexport { foo };`);
			await Bun.write(file2, `export { qux as baz };\nexport { baz };`);

			await fixDuplicateExportsInDirectory(tempDir, false);

			const result1 = await Bun.file(file1).text();
			const result2 = await Bun.file(file2).text();

			expect(result1).toBe(`export { foo };
`);
			expect(result2).toBe(`export { qux as baz };
`);
		});
	});

	describe('patch order edge cases', () => {
		test('handles partial duplicate followed by full duplicate', async () => {
			// This tests the scenario where modification shifts indices for subsequent removal
			const code = `export { foo };
export { foo, bar };
export { foo };`;

			// Expected: first foo kept, second becomes just bar, third removed
			const expected = `export { foo };
export { bar };
`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('handles multiple partial duplicates with full duplicate at end', async () => {
			const code = `export { foo };
export { foo, bar };
export { foo, baz };
export { foo };`;

			// First foo kept, second becomes bar only, third becomes baz only, fourth removed
			const expected = `export { foo };
export { bar };
export { baz };
`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});

		test('handles full duplicate followed by partial duplicate', async () => {
			const code = `export { foo, bar };
export { foo, bar };
export { bar, baz };`;

			// First kept, second removed (full dup - leaves blank line), third becomes just baz
			const expected = `export { foo, bar };

export { baz };`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});
	});

	describe('edge cases', () => {
		test('handles empty file', async () => {
			const code = '';
			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(code);
		});

		test('handles file with no exports', async () => {
			const code = `const foo = 1;\nconst bar = 2;`;
			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(code);
		});

		test('handles single export with alias', async () => {
			const code = `export { foo as bar };`;
			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(code);
		});

		test('handles export with semicolon vs without', async () => {
			const code = `export { foo }
export { foo };`;

			const expected = `export { foo }
`;

			const testFile = join(tempDir, 'test.js');
			await Bun.write(testFile, code);
			await fixDuplicateExportsInDirectory(tempDir, false);
			const result = await Bun.file(testFile).text();

			expect(result).toBe(expected);
		});
	});
});
