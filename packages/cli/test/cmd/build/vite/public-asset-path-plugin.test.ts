/**
 * Tests for public-asset-path-plugin
 *
 * This plugin fixes incorrect public asset paths in browser code:
 * - '/src/web/public/...'  → '/public/...'
 * - './src/web/public/...' → '/public/...'
 * - 'src/web/public/...'   → '/public/...'
 * - './public/...'         → '/public/...'
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { publicAssetPathPlugin } from '../../../../src/cmd/build/vite/public-asset-path-plugin';
import type { Plugin } from 'vite';

describe('publicAssetPathPlugin', () => {
	let plugin: Plugin;

	// Type for the transform function result
	type TransformResult = { code: string; map: null } | null;

	/**
	 * Helper to call transform with proper context
	 */
	function callTransform(
		code: string,
		id: string,
		warnFn?: (msg: string) => void
	): TransformResult {
		const transform = plugin.transform;
		if (!transform || typeof transform !== 'function') {
			throw new Error('Plugin transform is not a function');
		}

		const context = {
			warn: warnFn || (() => {}),
			// Minimal context properties that might be needed
			error: () => {},
			debug: () => {},
			info: () => {},
			meta: { rollupVersion: '4.0.0', watchMode: false },
		};

		const result = transform.call(context as never, code, id);
		return result as TransformResult;
	}

	/**
	 * Helper to initialize the plugin in build mode
	 */
	function initBuildMode() {
		plugin = publicAssetPathPlugin();
		// Simulate Vite calling configResolved with build command
		const configResolved = plugin.configResolved;
		if (configResolved && typeof configResolved === 'function') {
			configResolved.call(plugin as never, { command: 'build' } as never);
		}
	}

	/**
	 * Helper to initialize the plugin in dev mode
	 */
	function initDevMode(warnInDev = true) {
		plugin = publicAssetPathPlugin({ warnInDev });
		// Simulate Vite calling configResolved with serve command
		const configResolved = plugin.configResolved;
		if (configResolved && typeof configResolved === 'function') {
			configResolved.call(plugin as never, { command: 'serve' } as never);
		}
	}

	describe('build mode transformations', () => {
		beforeEach(() => {
			initBuildMode();
		});

		test('transforms /src/web/public/ paths with single quotes', () => {
			const code = `const logo = '/src/web/public/logo.svg';`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`const logo = '/public/logo.svg';`);
		});

		test('transforms /src/web/public/ paths with double quotes', () => {
			const code = `const logo = "/src/web/public/logo.svg";`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`const logo = "/public/logo.svg";`);
		});

		test('transforms /src/web/public/ paths with template literals', () => {
			const code = 'const logo = `/src/web/public/logo.svg`;';
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe('const logo = `/public/logo.svg`;');
		});

		test('transforms ./src/web/public/ paths', () => {
			const code = `const logo = './src/web/public/logo.svg';`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`const logo = '/public/logo.svg';`);
		});

		test('transforms src/web/public/ paths (no leading slash or dot)', () => {
			const code = `const logo = 'src/web/public/logo.svg';`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`const logo = '/public/logo.svg';`);
		});

		test('transforms ./public/ relative paths', () => {
			const code = `const logo = './public/logo.svg';`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`const logo = '/public/logo.svg';`);
		});

		test('transforms nested paths correctly', () => {
			const code = `const icon = '/src/web/public/images/icons/arrow.svg';`;
			const id = '/project/src/web/components/Icon.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`const icon = '/public/images/icons/arrow.svg';`);
		});

		test('transforms multiple occurrences in same file', () => {
			const code = `
const logo = '/src/web/public/logo.svg';
const icon = './src/web/public/icon.png';
const bg = './public/background.jpg';
`;
			const id = '/project/src/web/components/Assets.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toContain(`const logo = '/public/logo.svg';`);
			expect(result!.code).toContain(`const icon = '/public/icon.png';`);
			expect(result!.code).toContain(`const bg = '/public/background.jpg';`);
		});

		test('does not transform already correct /public/ paths', () => {
			const code = `const logo = '/public/logo.svg';`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			// Should return null (no transformation needed)
			expect(result).toBeNull();
		});

		test('does not transform files outside src/web/', () => {
			const code = `const path = '/src/web/public/logo.svg';`;
			const id = '/project/src/server/utils.ts';

			const result = callTransform(code, id);

			// Should return null (not in src/web/)
			expect(result).toBeNull();
		});

		test('does not transform code without matching patterns', () => {
			const code = `const name = 'hello world';`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			// Should return null (no patterns to transform)
			expect(result).toBeNull();
		});

		test('handles Windows-style paths in file id', () => {
			const code = `const logo = '/src/web/public/logo.svg';`;
			const id = 'C:\\project\\src\\web\\components\\Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`const logo = '/public/logo.svg';`);
		});

		test('transforms paths in JSX attributes', () => {
			const code = `<img src="/src/web/public/logo.svg" alt="Logo" />`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`<img src="/public/logo.svg" alt="Logo" />`);
		});

		test('transforms paths in object literals', () => {
			const code = `const config = { thumbnail: '/src/web/public/thumb.svg' };`;
			const id = '/project/src/web/config.ts';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`const config = { thumbnail: '/public/thumb.svg' };`);
		});

		test('transforms paths in arrays', () => {
			const code = `const images = ['/src/web/public/a.png', './src/web/public/b.png'];`;
			const id = '/project/src/web/gallery.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`const images = ['/public/a.png', '/public/b.png'];`);
		});
	});

	describe('dev mode behavior', () => {
		test('warns but does not transform in dev mode with warnInDev=true', () => {
			initDevMode(true);

			const code = `const logo = '/src/web/public/logo.svg';`;
			const id = '/project/src/web/components/Header.tsx';

			const warnings: string[] = [];
			const result = callTransform(code, id, (msg) => warnings.push(msg));

			// Should return null (no transformation in dev mode)
			expect(result).toBeNull();
			// Should have warned
			expect(warnings.length).toBe(1);
			expect(warnings[0]).toContain('src/web/public/');
			expect(warnings[0]).toContain('/public/');
		});

		test('does not warn when warnInDev=false', () => {
			initDevMode(false);

			const code = `const logo = '/src/web/public/logo.svg';`;
			const id = '/project/src/web/components/Header.tsx';

			const warnings: string[] = [];
			const result = callTransform(code, id, (msg) => warnings.push(msg));

			// Should return null (no transformation)
			expect(result).toBeNull();
			// Should not have warned
			expect(warnings.length).toBe(0);
		});

		test('warns only once per file per pattern type', () => {
			initDevMode(true);

			const code1 = `const a = '/src/web/public/a.svg';`;
			const code2 = `const b = '/src/web/public/b.svg';`;
			const id = '/project/src/web/components/Header.tsx';

			const warnings: string[] = [];
			const warnFn = (msg: string) => warnings.push(msg);

			// First call should warn
			callTransform(code1, id, warnFn);
			expect(warnings.length).toBe(1);

			// Second call with same file should not warn again for same pattern
			callTransform(code2, id, warnFn);
			expect(warnings.length).toBe(1);
		});

		test('warns for different pattern types in same file', () => {
			initDevMode(true);

			const code = `
const a = '/src/web/public/a.svg';
const b = './public/b.svg';
`;
			const id = '/project/src/web/components/Header.tsx';

			const warnings: string[] = [];
			callTransform(code, id, (msg) => warnings.push(msg));

			// Should warn about both patterns
			expect(warnings.length).toBe(1);
			expect(warnings[0]).toContain('src/web/public/');
			expect(warnings[0]).toContain('./public/');
		});
	});

	describe('edge cases', () => {
		beforeEach(() => {
			initBuildMode();
		});

		test('handles empty code', () => {
			const code = '';
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).toBeNull();
		});

		test('handles code with only whitespace', () => {
			const code = '   \n\t  ';
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).toBeNull();
		});

		test('does not transform when pattern is not at string start', () => {
			// The regex requires the pattern to be right after the opening quote
			// This string has text before the pattern, so it won't match
			const code = `const text = 'Check the src/web/public/ folder';`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			// The quick check passes (string contains 'src/web/public/')
			// but the regex doesn't match because there's text between quote and pattern
			// So no transformation occurs
			expect(result).toBeNull();
		});

		test('transforms when pattern is at string start', () => {
			// When the pattern is right after the quote, it matches
			const code = `const path = 'src/web/public/logo.svg';`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toBe(`const path = '/public/logo.svg';`);
		});

		test('handles mixed correct and incorrect paths', () => {
			const code = `
const correct = '/public/logo.svg';
const incorrect = '/src/web/public/icon.svg';
`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toContain(`const correct = '/public/logo.svg';`);
			expect(result!.code).toContain(`const incorrect = '/public/icon.svg';`);
		});

		test('preserves surrounding code', () => {
			const code = `
// Comment before
const logo = '/src/web/public/logo.svg';
// Comment after
export default logo;
`;
			const id = '/project/src/web/components/Header.tsx';

			const result = callTransform(code, id);

			expect(result).not.toBeNull();
			expect(result!.code).toContain('// Comment before');
			expect(result!.code).toContain('// Comment after');
			expect(result!.code).toContain('export default logo;');
		});
	});

	describe('plugin metadata', () => {
		test('has correct name', () => {
			const plugin = publicAssetPathPlugin();
			expect(plugin.name).toBe('agentuity:public-asset-path');
		});
	});
});
