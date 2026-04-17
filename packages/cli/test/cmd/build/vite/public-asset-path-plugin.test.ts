/**
 * Tests for `publicAssetPathPlugin`.
 *
 * The plugin lints browser source in `src/web/` for Agentuity-v1 public-asset
 * path patterns and fails the build (or warns in dev) when any of them are
 * present. It does **not** transform code — users are expected to fix the
 * source to follow Vite's conventions (`import fooUrl from …` or a
 * publicDir-root path without the `/public/` prefix).
 *
 * The anti-patterns we lint on are:
 *   - `'/public/foo.svg'` and `'./public/foo.svg'` (including template literal
 *     and double-quote variants)
 *   - `'src/web/public/foo.svg'` and its leading-slash / leading-dot forms
 *   - CSS `url(/public/foo.svg)` and `url(./public/foo.svg)` (unquoted)
 *
 * Non-violations must not produce diagnostics: files outside `src/web/`,
 * publicDir-root paths like `/foo.svg`, bare `public/foo` substrings that
 * are not quoted or inside `url(...)`.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { publicAssetPathPlugin } from '../../../../src/cmd/build/vite/public-asset-path-plugin';
import type { Plugin } from 'vite';

describe('publicAssetPathPlugin', () => {
	let plugin: Plugin;
	let errors: string[];
	let warnings: string[];

	// Fresh per test so "reported once per file" state doesn't leak.
	beforeEach(() => {
		errors = [];
		warnings = [];
	});

	/**
	 * Call the plugin's `transform` hook with a minimal Rollup-like context.
	 * `this.error()` throws (it aborts the build in real Vite), so we catch
	 * and record the message. `this.warn()` is captured without throwing.
	 */
	function callTransform(code: string, id: string): { code: string; map: null } | null {
		const transform = plugin.transform;
		if (!transform || typeof transform !== 'function') {
			throw new Error('Plugin transform is not a function');
		}

		const context = {
			error: (msg: string | Error) => {
				const text = msg instanceof Error ? msg.message : msg;
				errors.push(text);
				// Vite's real error throws — mimic that so build-mode behaviour is
				// faithful to what users see.
				throw new Error(text);
			},
			warn: (msg: string) => {
				warnings.push(msg);
			},
			debug: () => {},
			info: () => {},
			meta: { rollupVersion: '4.0.0', watchMode: false },
		};

		try {
			const result = transform.call(context as never, code, id);
			return result as { code: string; map: null } | null;
		} catch {
			// Errors surface in `errors[]`, not as return values.
			return null;
		}
	}

	function initBuildMode() {
		plugin = publicAssetPathPlugin();
		plugin.configResolved?.call(plugin as never, { command: 'build' } as never);
	}

	function initDevMode() {
		plugin = publicAssetPathPlugin();
		plugin.configResolved?.call(plugin as never, { command: 'serve' } as never);
	}

	function initForcedError() {
		plugin = publicAssetPathPlugin({ errorOnViolation: true });
		// `errorOnViolation` is explicit, so configResolved won't override it.
		plugin.configResolved?.call(plugin as never, { command: 'serve' } as never);
	}

	function initForcedWarn() {
		plugin = publicAssetPathPlugin({ errorOnViolation: false });
		plugin.configResolved?.call(plugin as never, { command: 'build' } as never);
	}

	describe('build mode: violations become errors', () => {
		beforeEach(() => initBuildMode());

		test('errors on /public/ in single-quoted string', () => {
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toContain('/public/');
			expect(errors[0]).toContain('Header.tsx');
			expect(warnings).toHaveLength(0);
		});

		test('errors on /public/ in double-quoted string', () => {
			callTransform(
				`const logo = "/public/logo.svg";`,
				'/project/src/web/components/Header.tsx'
			);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toContain('/public/');
		});

		test('errors on /public/ in template literal', () => {
			callTransform(
				'const logo = `/public/logo.svg`;',
				'/project/src/web/components/Header.tsx'
			);
			expect(errors).toHaveLength(1);
		});

		test('errors on ./public/ relative paths', () => {
			callTransform(
				`const logo = './public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toContain('./public/');
		});

		test('errors on src/web/public/ paths (with and without leading slash)', () => {
			callTransform(
				`const a = '/src/web/public/logo.svg';
const b = './src/web/public/logo.svg';
const c = 'src/web/public/logo.svg';`,
				'/project/src/web/components/Assets.tsx'
			);
			expect(errors).toHaveLength(1);
			// All three forms collapse into the single src/web/public/ diagnostic
			// for the file — we report each pattern once.
			expect(errors[0]).toContain('src/web/public/');
		});

		test('errors on CSS url(/public/...) unquoted', () => {
			callTransform(
				`.logo { background: url(/public/bg.png); }`,
				'/project/src/web/styles/logo.css'
			);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toContain('url(/public/');
		});

		test('errors on CSS url(./public/...) unquoted', () => {
			callTransform(
				`.logo { background: url(./public/bg.png); }`,
				'/project/src/web/styles/logo.css'
			);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toContain('url(./public/');
		});

		test('reports multiple distinct patterns in one diagnostic', () => {
			callTransform(
				`const a = '/public/a.svg';
const b = './public/b.svg';
.bg { background: url(/public/c.png); }`,
				'/project/src/web/mixed.tsx'
			);
			expect(errors).toHaveLength(1);
			const msg = errors[0];
			expect(msg).toContain('/public/');
			expect(msg).toContain('./public/');
			expect(msg).toContain('url(/public/');
		});

		test('includes remediation pointing at Vite docs', () => {
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(errors[0]).toContain('vitejs.dev');
		});
	});

	describe('dev mode: violations become warnings', () => {
		beforeEach(() => initDevMode());

		test('warns but does not error on /public/ in dev', () => {
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(errors).toHaveLength(0);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('/public/');
		});

		test('warns only once per pattern per file across repeat transforms', () => {
			// Simulate HMR re-transforming the same file twice with identical code.
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

		test('re-warns on a different file in the same session', () => {
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
		beforeEach(() => initBuildMode());

		test('ignores files outside src/web/', () => {
			callTransform(`const path = '/public/logo.svg';`, '/project/src/agent/utils.ts');
			expect(errors).toHaveLength(0);
			expect(warnings).toHaveLength(0);
		});

		test('ignores publicDir-root paths (no /public/ prefix)', () => {
			callTransform(
				`const favicon = '/favicon.ico';
const logo = '/images/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(errors).toHaveLength(0);
		});

		test('ignores file with no public path references', () => {
			callTransform(
				`export const greeting = 'hello';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(errors).toHaveLength(0);
		});

		test('ignores substrings that only contain "public" as a word', () => {
			// Quoted strings without the /public/ prefix or src/web/public/
			// prefix must not trigger — `public/api` is common.
			callTransform(
				`const role = 'public';
const cfg = { access: 'public' };`,
				'/project/src/web/components/Auth.tsx'
			);
			expect(errors).toHaveLength(0);
		});
	});

	describe('explicit errorOnViolation override', () => {
		test('errorOnViolation: true forces errors even in serve/dev', () => {
			initForcedError();
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(errors).toHaveLength(1);
			expect(warnings).toHaveLength(0);
		});

		test('errorOnViolation: false forces warnings even in build', () => {
			initForcedWarn();
			callTransform(
				`const logo = '/public/logo.svg';`,
				'/project/src/web/components/Header.tsx'
			);
			expect(errors).toHaveLength(0);
			expect(warnings).toHaveLength(1);
		});
	});

	describe('platform paths', () => {
		beforeEach(() => initBuildMode());

		test('accepts Windows-style src\\web\\ paths in file id', () => {
			callTransform(
				`const logo = '/public/logo.svg';`,
				'C:\\project\\src\\web\\components\\Header.tsx'
			);
			expect(errors).toHaveLength(1);
		});
	});

	describe('plugin metadata', () => {
		test('has a stable plugin name', () => {
			initBuildMode();
			expect(plugin.name).toBe('agentuity:public-asset-path-lint');
		});
	});
});
