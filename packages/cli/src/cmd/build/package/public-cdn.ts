/**
 * CDN packaging helpers for framework "public/" (or root-static) files.
 *
 * Next.js `assetPrefix` only rewrites `/_next/*`. Files under `public/`
 * (e.g. `/next.svg`) stay origin-relative unless we:
 *  1. List them for CDN upload (`launch.static.include`)
 *  2. Rewrite root-absolute references to `{cdnBase}{relpath}`
 *
 * Same pattern applies to any framework where staticAssetPublicPath is a
 * non-empty prefix of the built tree and loose public files live beside it.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { toPosixPath } from '../deploy-ignore.ts';

const REWRITE_EXTENSIONS = new Set([
	'.html',
	'.htm',
	'.js',
	'.mjs',
	'.cjs',
	'.json',
	'.css',
	'.rsc',
	'.map',
	'.txt',
]);

/**
 * List files under `publicDir` as posix paths relative to that root
 * (e.g. `next.svg`, `icons/logo.png`). Empty if dir missing.
 */
export function listPublicRelativeFiles(publicDir: string): string[] {
	if (!existsSync(publicDir) || !statSync(publicDir).isDirectory()) {
		return [];
	}
	const out: string[] = [];
	const stack: string[] = [publicDir];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry === '.' || entry === '..') continue;
			const full = join(dir, entry);
			let isDir: boolean;
			try {
				isDir = statSync(full).isDirectory();
			} catch {
				continue;
			}
			if (isDir) {
				stack.push(full);
				continue;
			}
			const rel = toPosixPath(relative(publicDir, full));
			if (!rel || rel.startsWith('..')) continue;
			out.push(rel);
		}
	}
	return out.sort();
}

/**
 * Escape a path for use inside a RegExp character class-safe pattern.
 */
function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite root-absolute references to known public files so they load from CDN.
 *
 * Matches `/file.svg`, `"/file.svg"`, `'/file.svg'`, `` `/file.svg` ``, and
 * `url(/file.svg)` style, only for exact relative paths listed in `publicFiles`.
 *
 * @param content - file text
 * @param publicFiles - posix relpaths from public root (no leading slash)
 * @param cdnBase - absolute CDN base **with** trailing slash
 */
export function rewritePublicAssetUrlsInText(
	content: string,
	publicFiles: readonly string[],
	cdnBase: string
): string {
	const base = cdnBase.endsWith('/') ? cdnBase : `${cdnBase}/`;
	if (!publicFiles.length) return content;

	// Longest paths first so `icons/a.svg` wins over a hypothetical `a.svg` collision
	// when used as a suffix (we match full path after /).
	const sorted = [...publicFiles].sort((a, b) => b.length - a.length);
	let out = content;
	for (const rel of sorted) {
		const esc = escapeRegExp(rel);
		// Require a boundary before the leading slash so we don't match
		// `https://cdn…/genesis/next.svg` again or `/_next/static/…`.
		// Preceding char: start, quote, =, (, whitespace, or >.
		const re = new RegExp(`(^|["'\`=(\\s>])\\/${esc}(?=["'\`\\s),>\\?#]|$)`, 'g');
		out = out.replace(re, `$1${base}${rel}`);
	}
	return out;
}

export interface RewritePublicAssetsResult {
	filesScanned: number;
	filesChanged: number;
	publicFileCount: number;
}

/**
 * Walk `treeRoot` (typically Next server dir or package root), rewrite text
 * files that reference `/publicRel` paths to `{cdnBase}{publicRel}`.
 */
export function rewritePublicAssetUrlsInTree(
	treeRoot: string,
	publicDir: string,
	cdnBase: string
): RewritePublicAssetsResult {
	const publicFiles = listPublicRelativeFiles(publicDir);
	if (!publicFiles.length || !existsSync(treeRoot)) {
		return { filesScanned: 0, filesChanged: 0, publicFileCount: publicFiles.length };
	}

	let filesScanned = 0;
	let filesChanged = 0;
	const stack: string[] = [treeRoot];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry === 'node_modules' || entry === '.git') continue;
			const full = join(dir, entry);
			let isDir: boolean;
			try {
				isDir = statSync(full).isDirectory();
			} catch {
				continue;
			}
			if (isDir) {
				// Skip the public dir itself (no HTML there to rewrite)
				if (full === publicDir) continue;
				stack.push(full);
				continue;
			}
			const lower = entry.toLowerCase();
			const dot = lower.lastIndexOf('.');
			const ext = dot >= 0 ? lower.slice(dot) : '';
			if (!REWRITE_EXTENSIONS.has(ext)) continue;

			filesScanned++;
			let text: string;
			try {
				text = readFileSync(full, 'utf-8');
			} catch {
				continue;
			}
			const next = rewritePublicAssetUrlsInText(text, publicFiles, cdnBase);
			if (next !== text) {
				writeFileSync(full, next, 'utf-8');
				filesChanged++;
			}
		}
	}
	return { filesScanned, filesChanged, publicFileCount: publicFiles.length };
}
