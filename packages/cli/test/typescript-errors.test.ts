import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { formatTypeScriptErrors, hasErrors, getErrorCount } from '../src/typescript-errors';
import type { GrammarItem } from '../src/tsc-output-parser';
import { stripAnsi } from '../src/tui';
import { symbols } from '../src/tui/symbols';

function createMockError(
	path: string,
	line: number,
	col: number,
	errorCode: string,
	message: string
): GrammarItem {
	return {
		type: 'Item',
		value: {
			path: { type: 'Path', value: path },
			cursor: { type: 'Cursor', value: { line, col } },
			tsError: { type: 'TsError', value: { type: 'error', errorString: errorCode } },
			message: { type: 'Message', value: message },
		},
	};
}

// Use the actual bar symbol (│ in unicode, | in ASCII) so tests pass in both environments
const BAR = symbols.bar;
const CORNER_TL = symbols.cornerTL;

describe('TypeScript Error Formatting', () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'ts-error-test-'));
	});

	afterAll(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe('Box alignment with spaces', () => {
		test('renders aligned box for code with space indentation', async () => {
			const sourceFile = join(tempDir, 'spaces.ts');
			await Bun.write(
				sourceFile,
				`const config = {
    // enable workbench
    workbench,
};
`
			);

			const items: GrammarItem[] = [
				createMockError('spaces.ts', 3, 5, 'TS2353', "Property 'workbench' does not exist."),
			];

			const output = await formatTypeScriptErrors(items, { projectDir: tempDir });
			const stripped = stripAnsi(output);

			const boxLines = stripped.split('\n').filter((line) => line.includes(BAR));

			const lengths = boxLines.map((line) => line.length);
			const uniqueLengths = [...new Set(lengths)];

			expect(uniqueLengths.length).toBe(1);
		});
	});

	describe('Box alignment with tabs', () => {
		test('renders aligned box for code with tab indentation', async () => {
			const sourceFile = join(tempDir, 'tabs.ts');
			await Bun.write(sourceFile, `const config = {\n\t// enable workbench\n\tworkbench,\n};\n`);

			const items: GrammarItem[] = [
				createMockError('tabs.ts', 3, 2, 'TS2353', "Property 'workbench' does not exist."),
			];

			const output = await formatTypeScriptErrors(items, { projectDir: tempDir });
			const stripped = stripAnsi(output);

			const boxLines = stripped.split('\n').filter((line) => line.includes(BAR));

			const lengths = boxLines.map((line) => line.length);
			const uniqueLengths = [...new Set(lengths)];

			expect(uniqueLengths.length).toBe(1);
		});

		test('tabs are expanded to spaces in output', async () => {
			const sourceFile = join(tempDir, 'tab-expand.ts');
			await Bun.write(sourceFile, `const x = {\n\tfoo: 1,\n};\n`);

			const items: GrammarItem[] = [
				createMockError('tab-expand.ts', 2, 2, 'TS2322', 'Type error'),
			];

			const output = await formatTypeScriptErrors(items, { projectDir: tempDir });
			const stripped = stripAnsi(output);

			expect(stripped).not.toContain('\t');
			expect(stripped).toContain('foo: 1');
		});
	});

	describe('Caret placement', () => {
		test('carets align with identifier in space-indented code', async () => {
			const sourceFile = join(tempDir, 'caret-spaces.ts');
			await Bun.write(
				sourceFile,
				`const obj = {
    badProperty,
};
`
			);

			const items: GrammarItem[] = [
				createMockError('caret-spaces.ts', 2, 5, 'TS2304', "Cannot find name 'badProperty'."),
			];

			const output = await formatTypeScriptErrors(items, { projectDir: tempDir });
			const stripped = stripAnsi(output);
			const lines = stripped.split('\n');

			const contentLineIdx = lines.findIndex(
				(l) => l.includes('badProperty') && l.includes(BAR)
			);
			expect(contentLineIdx).toBeGreaterThan(-1);

			const caretLine = lines.find(
				(l) => l.includes('^') && l.includes(BAR) && !l.includes('badProperty')
			);
			expect(caretLine).toBeDefined();

			const contentLine = lines[contentLineIdx];
			const identifierStart = contentLine!.indexOf('badProperty');
			const caretStart = caretLine!.indexOf('^');

			expect(Math.abs(caretStart - identifierStart)).toBeLessThanOrEqual(1);
		});

		test('carets align with identifier in tab-indented code', async () => {
			const sourceFile = join(tempDir, 'caret-tabs.ts');
			await Bun.write(sourceFile, `const obj = {\n\tbadProperty,\n};\n`);

			const items: GrammarItem[] = [
				createMockError('caret-tabs.ts', 2, 2, 'TS2304', "Cannot find name 'badProperty'."),
			];

			const output = await formatTypeScriptErrors(items, { projectDir: tempDir });
			const stripped = stripAnsi(output);
			const lines = stripped.split('\n');

			const contentLineIdx = lines.findIndex(
				(l) => l.includes('badProperty') && l.includes(BAR)
			);
			expect(contentLineIdx).toBeGreaterThan(-1);

			const caretLine = lines.find(
				(l) => l.includes('^') && l.includes(BAR) && !l.includes('badProperty')
			);
			expect(caretLine).toBeDefined();

			const contentLine = lines[contentLineIdx];
			const identifierStart = contentLine!.indexOf('badProperty');
			const caretStart = caretLine!.indexOf('^');

			expect(Math.abs(caretStart - identifierStart)).toBeLessThanOrEqual(1);
		});

		test('caret length matches identifier length', async () => {
			const sourceFile = join(tempDir, 'caret-length.ts');
			await Bun.write(sourceFile, `const x = unknownVariable;\n`);

			const items: GrammarItem[] = [
				createMockError(
					'caret-length.ts',
					1,
					11,
					'TS2304',
					"Cannot find name 'unknownVariable'."
				),
			];

			const output = await formatTypeScriptErrors(items, { projectDir: tempDir });
			const stripped = stripAnsi(output);
			const lines = stripped.split('\n');

			const caretLine = lines.find((l) => l.includes('^') && !l.includes('unknownVariable'));
			expect(caretLine).toBeDefined();

			const caretMatch = caretLine!.match(/\^+/);
			expect(caretMatch).not.toBeNull();
			expect(caretMatch![0].length).toBe('unknownVariable'.length);
		});
	});

	describe('Multiple errors', () => {
		test('formats multiple errors with consistent box width', async () => {
			const sourceFile = join(tempDir, 'multi.ts');
			await Bun.write(
				sourceFile,
				`const a = foo;
const b = bar;
const c = baz;
`
			);

			const items: GrammarItem[] = [
				createMockError('multi.ts', 1, 11, 'TS2304', "Cannot find name 'foo'."),
				createMockError('multi.ts', 2, 11, 'TS2304', "Cannot find name 'bar'."),
				createMockError('multi.ts', 3, 11, 'TS2304', "Cannot find name 'baz'."),
			];

			const output = await formatTypeScriptErrors(items, { projectDir: tempDir });
			const stripped = stripAnsi(output);

			// Each error produces box lines with the corner symbol
			const boxTopLines = stripped.split('\n').filter((line) => line.includes(CORNER_TL));

			// 3 errors, each with 2 corner-TL lines (header + code box)
			expect(boxTopLines.length).toBe(6);
		});
	});

	describe('hasErrors and getErrorCount', () => {
		test('hasErrors returns true for error items', () => {
			const items: GrammarItem[] = [createMockError('test.ts', 1, 1, 'TS2304', 'Error')];
			expect(hasErrors(items)).toBe(true);
		});

		test('hasErrors returns false for empty items', () => {
			expect(hasErrors([])).toBe(false);
		});

		test('getErrorCount returns correct count', () => {
			const items: GrammarItem[] = [
				createMockError('test.ts', 1, 1, 'TS2304', 'Error 1'),
				createMockError('test.ts', 2, 1, 'TS2304', 'Error 2'),
				createMockError('test.ts', 3, 1, 'TS2304', 'Error 3'),
			];
			expect(getErrorCount(items)).toBe(3);
		});
	});

	describe('Edge cases', () => {
		test('handles missing source file gracefully', async () => {
			const items: GrammarItem[] = [createMockError('nonexistent.ts', 1, 1, 'TS2304', 'Error')];

			const output = await formatTypeScriptErrors(items, { projectDir: tempDir });
			expect(output).toContain('source not available');
		});

		test('handles empty error list', async () => {
			const output = await formatTypeScriptErrors([], { projectDir: tempDir });
			expect(output).toBe('');
		});

		test('handles very long error messages', async () => {
			const sourceFile = join(tempDir, 'long-msg.ts');
			await Bun.write(sourceFile, `const x = 1;\n`);

			const longMessage =
				"Object literal may only specify known properties, and 'foo' does not exist in type '{ a?: string; b?: number; c?: boolean; d?: object; e?: array; f?: function; g?: symbol; h?: undefined; i?: null; }'.";

			const items: GrammarItem[] = [createMockError('long-msg.ts', 1, 7, 'TS2353', longMessage)];

			const output = await formatTypeScriptErrors(items, { projectDir: tempDir });
			const stripped = stripAnsi(output);

			expect(stripped).toContain('Object literal');

			const boxLines = stripped.split('\n').filter((line) => line.includes(BAR));
			const lengths = boxLines.map((line) => line.length);
			const uniqueLengths = [...new Set(lengths)];
			expect(uniqueLengths.length).toBe(1);
		});
	});
});
