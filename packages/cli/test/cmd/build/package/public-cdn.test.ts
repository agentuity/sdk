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
});
