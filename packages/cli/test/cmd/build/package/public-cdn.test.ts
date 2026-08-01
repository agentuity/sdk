import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	listPublicRelativeFiles,
	rewritePublicAssetUrlsInText,
	rewritePublicAssetUrlsInTree,
} from '../../../../src/cmd/build/package/public-cdn.ts';

function makeDir(): string {
	const dir = join(tmpdir(), `public-cdn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe('listPublicRelativeFiles', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
		dirs.length = 0;
	});

	test('lists nested public files as posix paths', () => {
		const dir = makeDir();
		dirs.push(dir);
		writeFileSync(join(dir, 'next.svg'), '<svg/>');
		mkdirSync(join(dir, 'icons'), { recursive: true });
		writeFileSync(join(dir, 'icons', 'logo.png'), 'png');
		expect(listPublicRelativeFiles(dir)).toEqual(['icons/logo.png', 'next.svg']);
	});

	test('empty when missing', () => {
		expect(listPublicRelativeFiles(join(tmpdir(), 'no-such-public-dir-xyz'))).toEqual([]);
	});

	test('skips node_modules under public', () => {
		const dir = makeDir();
		dirs.push(dir);
		writeFileSync(join(dir, 'ok.svg'), 'x');
		mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
		writeFileSync(join(dir, 'node_modules', 'pkg', 'x.js'), 'x');
		expect(listPublicRelativeFiles(dir)).toEqual(['ok.svg']);
	});
});

describe('rewritePublicAssetUrlsInText', () => {
	const files = ['next.svg', 'vercel.svg', 'icons/a.png'];
	const base = 'https://cdn.agentcompany.com/genesis/';

	test('rewrites quoted src and href', () => {
		const in_ = `<img src="/next.svg"/><a href='/vercel.svg'>x</a>`;
		const out = rewritePublicAssetUrlsInText(in_, files, base);
		expect(out).toContain('src="https://cdn.agentcompany.com/genesis/next.svg"');
		expect(out).toContain("href='https://cdn.agentcompany.com/genesis/vercel.svg'");
	});

	test('does not rewrite _next static paths', () => {
		const in_ = `src="https://cdn.agentcompany.com/genesis/_next/static/chunks/a.js"`;
		expect(rewritePublicAssetUrlsInText(in_, files, base)).toBe(in_);
	});

	test('does not double-rewrite already absolute CDN public urls', () => {
		const in_ = `src="https://cdn.agentcompany.com/genesis/next.svg"`;
		// Leading char before /next.svg is 's' of genesis — our pattern requires boundary
		// before /. Absolute CDN URLs should not match as root-absolute /next.svg.
		expect(rewritePublicAssetUrlsInText(in_, files, base)).toBe(in_);
	});

	test('rewrites nested public path', () => {
		const in_ = `url(/icons/a.png)`;
		const out = rewritePublicAssetUrlsInText(in_, files, base);
		expect(out).toBe('url(https://cdn.agentcompany.com/genesis/icons/a.png)');
	});

	test('rewrites srcset and query/hash boundaries', () => {
		const in_ = `srcset="/next.svg 1x, /vercel.svg 2x" href="/next.svg?v=1#top"`;
		const out = rewritePublicAssetUrlsInText(in_, files, base);
		expect(out).toContain(`${base}next.svg 1x`);
		expect(out).toContain(`${base}vercel.svg 2x`);
		expect(out).toContain(`${base}next.svg?v=1#top`);
	});

	test('longest path wins for nested names', () => {
		const nested = ['a.png', 'icons/a.png'];
		const in_ = `url(/icons/a.png) url(/a.png)`;
		const out = rewritePublicAssetUrlsInText(in_, nested, base);
		expect(out).toBe(`url(${base}icons/a.png) url(${base}a.png)`);
	});

	test('normalizes base without trailing slash', () => {
		const out = rewritePublicAssetUrlsInText(
			`src="/next.svg"`,
			files,
			'https://cdn.agentcompany.com/genesis'
		);
		expect(out).toBe(`src="https://cdn.agentcompany.com/genesis/next.svg"`);
	});

	test('no-op when public file list is empty', () => {
		const in_ = `src="/next.svg"`;
		expect(rewritePublicAssetUrlsInText(in_, [], base)).toBe(in_);
	});
});

describe('rewritePublicAssetUrlsInTree', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
		dirs.length = 0;
	});

	test('rewrites HTML under server tree', () => {
		const root = makeDir();
		dirs.push(root);
		const pub = join(root, 'public');
		const server = join(root, '.next', 'server', 'app');
		mkdirSync(pub, { recursive: true });
		mkdirSync(server, { recursive: true });
		writeFileSync(join(pub, 'next.svg'), '<svg/>');
		writeFileSync(
			join(server, 'index.html'),
			`<img src="/next.svg" alt="logo"/><script src="https://cdn.x/genesis/_next/static/x.js"></script>`
		);
		const r = rewritePublicAssetUrlsInTree(root, pub, 'https://cdn.agentcompany.com/genesis/');
		expect(r.publicFileCount).toBe(1);
		expect(r.filesChanged).toBe(1);
		const html = readFileSync(join(server, 'index.html'), 'utf-8');
		expect(html).toContain('https://cdn.agentcompany.com/genesis/next.svg');
		expect(html).toContain('https://cdn.x/genesis/_next/static/x.js');
	});

	test('skips public dir itself and node_modules', () => {
		const root = makeDir();
		dirs.push(root);
		const pub = join(root, 'public');
		const nm = join(root, 'node_modules', 'pkg');
		mkdirSync(pub, { recursive: true });
		mkdirSync(nm, { recursive: true });
		writeFileSync(join(pub, 'next.svg'), '<svg/>');
		// If we rewrote under public/, this would change — ensure we skip it
		writeFileSync(join(pub, 'readme.txt'), 'see /next.svg');
		writeFileSync(join(nm, 'x.js'), `import "/next.svg"`);
		writeFileSync(join(root, 'app.js'), `const u = "/next.svg"`);

		const r = rewritePublicAssetUrlsInTree(root, pub, 'https://cdn.example.com/');
		expect(r.filesChanged).toBe(1);
		expect(readFileSync(join(pub, 'readme.txt'), 'utf-8')).toBe('see /next.svg');
		expect(readFileSync(join(nm, 'x.js'), 'utf-8')).toBe(`import "/next.svg"`);
		expect(readFileSync(join(root, 'app.js'), 'utf-8')).toBe(
			`const u = "https://cdn.example.com/next.svg"`
		);
	});
});
