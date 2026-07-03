import { afterEach, describe, expect, test } from 'bun:test';
import { getOriginalConsole } from '../src/globals.ts';
import { patchConsole, restoreConsole } from '../src/logger.ts';

const originalConsoleKey = Symbol.for('@agentuity/telemetry:originalConsole');

function countInfoPrefixes(line: string): number {
	return (line.match(/\[INFO\]/g) ?? []).length;
}

describe('patchConsole hot reload', () => {
	afterEach(() => {
		restoreConsole();
	});

	test('does not stack [INFO] prefixes across repeated patchConsole calls', () => {
		const lines: string[] = [];
		const native = getOriginalConsole();
		const originalInfo = native.info.bind(native);
		native.info = (...args: unknown[]) => {
			lines.push(args.map(String).join(' '));
		};

		try {
			for (let generation = 0; generation < 5; generation++) {
				// Simulate bun --hot re-evaluating this module while console is already patched:
				// a naive Object.create(console) would capture the patch. getOriginalConsole
				// must keep returning the native snapshot.
				const snapshot = getOriginalConsole();
				expect(snapshot).toBe((globalThis as Record<symbol, Console>)[originalConsoleKey]);

				patchConsole(true, { generation }, 'info');
				console.info(`hello gen=${generation}`);
			}

			expect(lines.length).toBe(5);
			for (const line of lines) {
				expect(countInfoPrefixes(line)).toBe(1);
			}
			expect(lines[4]).toContain('hello gen=4');
		} finally {
			native.info = originalInfo;
		}
	});

	test('restoreConsole returns the native console', () => {
		const native = getOriginalConsole();
		patchConsole(true, {}, 'info');
		expect(globalThis.console).not.toBe(native);
		restoreConsole();
		expect(globalThis.console).toBe(native);
	});
});
