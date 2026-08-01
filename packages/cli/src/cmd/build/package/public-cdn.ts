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
 *
 * Call sites: packaging (`packageBuildOutput`) owns rewrite + include emission;
 * adapters only stage `publicStaticDir` on {@link BuildResult}.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, type Dirent } from 'node:fs';
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

const SKIP_DIR_NAMES = new Set(['node_modules', '.git']);

/**
 * Escape a path for use inside a RegExp.
 */
function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Walk `root` depth-first, invoking `onFile` for each regular file.
 * Skips `node_modules` / `.git` and optional absolute dirs in `skipDirs`.
 */
function walkFiles(
	root: string,
	onFile: (fullPath: string, entryName: string) => void,
	skipDirs?: ReadonlySet<string>
): void {
	if (!existsSync(root)) return;
	const stack: string[] = [root];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (SKIP_DIR_NAMES.has(entry.name)) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (skipDirs?.has(full)) continue;
				stack.push(full);
				continue;
			}
			if (!entry.isFile()) continue;
			onFile(full, entry.name);
		}
	}
}

/**
 * List files under `publicDir` as posix paths relative to that root
 * (e.g. `next.svg`, `icons/logo.png`). Empty if dir missing.
 */
export function listPublicRelativeFiles(publicDir: string): string[] {
	if (!existsSync(publicDir)) return [];
	const out: string[] = [];
	walkFiles(publicDir, (full) => {
		const rel = toPosixPath(relative(publicDir, full));
		if (!rel || rel.startsWith('..')) return;
		out.push(rel);
	});
	return out.sort();
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

	// Longest paths first so `icons/a.svg` wins over a hypothetical shorter
	// collision when used as a suffix (we match full path after /).
	const sorted = [...publicFiles].sort((a, b) => b.length - a.length);
	const alt = sorted.map(escapeRegExp).join('|');
	// Require a boundary before the leading slash so we don't match
	// `https://cdn…/genesis/next.svg` again or `/_next/static/…`.
	// Preceding char: start, quote, =, (, whitespace, or >.
	const re = new RegExp(`(^|["'\`=(\\s>])\\/(${alt})(?=["'\`\\s),>\\?#]|$)`, 'g');
	return content.replace(re, `$1${base}$2`);
}

export interface RewritePublicAssetsResult {
	filesScanned: number;
	filesChanged: number;
	publicFileCount: number;
}

/**
 * Walk `treeRoot` (typically the process working directory), rewrite text
 * files that reference `/publicRel` paths to `{cdnBase}{publicRel}`.
 * Skips the public directory itself (no HTML to rewrite there).
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
	const skipDirs = new Set<string>([publicDir]);

	walkFiles(
		treeRoot,
		(full, entryName) => {
			const lower = entryName.toLowerCase();
			const dot = lower.lastIndexOf('.');
			const ext = dot >= 0 ? lower.slice(dot) : '';
			if (!REWRITE_EXTENSIONS.has(ext)) return;

			filesScanned++;
			let text: string;
			try {
				text = readFileSync(full, 'utf-8');
			} catch {
				return;
			}
			const next = rewritePublicAssetUrlsInText(text, publicFiles, cdnBase);
			if (next !== text) {
				writeFileSync(full, next, 'utf-8');
				filesChanged++;
			}
		},
		skipDirs
	);

	return { filesScanned, filesChanged, publicFileCount: publicFiles.length };
}
