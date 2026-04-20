/**
 * Tests for `publicAssetPathPlugin`.
 *
 * The plugin warns about Agentuity-v1 public-asset path patterns in browser
 * source under `src/web/`. It never fails the build \u2014 the warning surfaces
 * in Vite's output, developers fix their source, integration tests catch
 * regressions at deploy time.
 *
 * Patterns flagged:
 *   - `'/public/foo.svg'` and `'./public/foo.svg'` (quoted strings)
 *   - `'src/web/public/foo.svg'` (and leading `/`/`./` forms)
 *   - CSS `url(/public/...)` and `url(./public/...)` (unquoted)
 *
 * Non-violations: files outside `src/web/`, publicDir-root paths like
 * `/foo.svg`, bare `"public"` strings that aren't prefixed by `/` or `./`.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { publicAssetPathPlugin } from '../../../../src/cmd/build/vite/public-asset-path-plugin';
import type { Plugin } from 'vite';

describe('publicAssetPathPlugin', () => {
	let plugin: Plugin;
	let warnings: string[];

	beforeEach(() => {
		plugin = publicAssetPathPlugin();
		warnings = [];
	});

	/**
	 * Call the plugin's `transform` hook with a minimal Rollup-like context.
	 * Captures `this.warn()` output; `this.error()` should never be called
	 * by this plugin.
	 */
	function callTransform(code: string, id: string): void {
		const transform = plugin.transform;
		if (!transform || typeof transform !== 'function') {
			throw new Error('Plugin transform is not a function');
		}

		const context = {
			warn: (msg: string) => {
				warnings.push(msg);
			},
			error: (msg: string | Error) => {
				const text = msg instanceof Error ? msg.message : msg;
				throw new Error(`plugin unexpectedly called this.error(${text})`);
			},
			debug: () => {},
			info: () => {},
			meta: { rollupVersion: '4.0.0', watchMode: false },
		};

		transform.call(context as never, code, id);
	}

	describe('warns on legacy patterns', () => {
		test('warns on /public/ in single-quoted string', () => {
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('/public/');
			expect(warnings[0]).toContain('Header.tsx');
		});

		test('warns on /public/ in double-quoted string', () => {
			callTransform(
				`const logo = "/public/logo.svg";`,
				'/project/src/web/components/Header.tsx'
			);
			expect(warnings).toHaveLength(1);
		});

		test('warns on /public/ in template literal', () => {
			callTransform(
				'const logo = `/public/logo.svg`;',
				'/project/src/web/components/Header.tsx'
			);
			expect(warnings).toHaveLength(1);
		});

		test('warns on ./public/ relative paths', () => {
			callTransform(
				`const logo = './public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('./public/');
		});

		test('warns on src/web/public/ paths (with and without leading slash)', () => {
			callTransform(
				`const a = '/src/web/public/logo.svg';
const b = './src/web/public/logo.svg';
const c = 'src/web/public/logo.svg';`,
				'/project/src/web/components/Assets.tsx'
			);
			// All three forms share the single src/web/public/ pattern entry.
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('src/web/public/');
		});

		test('warns on CSS url(/public/...) unquoted', () => {
			callTransform(
				`.logo { background: url(/public/bg.png); }`,
				'/project/src/web/styles/logo.css'
			);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('url(/public/');
		});

		test('warns on CSS url(./public/...) unquoted', () => {
			callTransform(
				`.logo { background: url(./public/bg.png); }`,
				'/project/src/web/styles/logo.css'
			);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('url(./public/');
		});

		test('warns on CSS url(...) with single quotes', () => {
			callTransform(
				`.logo { background: url('/public/bg.png'); }`,
				'/project/src/web/styles/logo.css'
			);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('url(/public/');
		});

		test('warns on CSS url(...) with double quotes and leading whitespace', () => {
			callTransform(
				`.logo { background: url( "/public/bg.png"); }`,
				'/project/src/web/styles/logo.css'
			);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('url(/public/');
		});

		test('warns on CSS url(./public/...) with quotes and whitespace', () => {
			callTransform(
				`.logo { background: url( './public/bg.png'); }`,
				'/project/src/web/styles/logo.css'
			);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('url(./public/');
		});

		test('reports multiple distinct patterns in one diagnostic', () => {
			callTransform(
				`const a = '/public/a.svg';
const b = './public/b.svg';
.bg { background: url(/public/c.png); }`,
				'/project/src/web/mixed.tsx'
			);
			expect(warnings).toHaveLength(1);
			const msg = warnings[0];
			expect(msg).toContain('/public/');
			expect(msg).toContain('./public/');
			expect(msg).toContain('url(/public/');
		});

		test('includes remediation pointing at Vite docs', () => {
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(warnings[0]).toContain('vitejs.dev');
		});
	});

	describe('dedupes repeated reports', () => {
		test('does not re-warn on repeated transforms of the same file', () => {
			// Simulate HMR re-transforming the same file twice.
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(warnings).toHaveLength(1);
		});

		test('warns separately for distinct files in the same session', () => {
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Footer.tsx'
			);
			expect(warnings).toHaveLength(2);
		});
	});

	describe('non-violations', () => {
		test('ignores files outside src/web/', () => {
			callTransform(`const path = '/public/logo.svg';`, '/project/src/agent/utils.ts');
			expect(warnings).toHaveLength(0);
		});

		test('ignores publicDir-root paths (no /public/ prefix)', () => {
			callTransform(
				`const favicon = '/favicon.ico';
const logo = '/images/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(warnings).toHaveLength(0);
		});

		test('ignores file with no public path references', () => {
			callTransform(
				`export const greeting = 'hello';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(warnings).toHaveLength(0);
		});

		test('ignores substrings that only contain "public" as a word', () => {
			callTransform(
				`const role = 'public';
const cfg = { access: 'public' };`,
				'/project/src/web/components/Auth.tsx'
			);
			expect(warnings).toHaveLength(0);
		});
	});

	describe('platform paths', () => {
		test('accepts Windows-style src\\web\\ paths in file id', () => {
			callTransform(
				`const logo = '/public/logo.svg';`,
				'C:\\project\\src\\web\\components\\Header.tsx'
			);
			expect(warnings).toHaveLength(1);
		});
	});

	describe('plugin metadata', () => {
		test('has a stable plugin name', () => {
			expect(plugin.name).toBe('agentuity:public-asset-path-lint');
		});
	});
});
