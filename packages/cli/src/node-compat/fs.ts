/**
 * File system shims.
 *
 * The trivial pass-throughs (readText, readJson, writeText, etc.)
 * have been inlined at their call sites — `await readFile(p, 'utf-8')`
 * is no harder to read than `readText(p)` and saves an import.
 *
 * What survives are the two helpers that are genuinely awkward inline:
 *
 *   - `pathExists` — Node's `node:fs` has no boolean-returning
 *     existence check; the canonical idiom
 *     `await access(p).then(() => true).catch(() => false)` is ugly
 *     enough that centralizing it pays off across ~30 call sites.
 *   - `openReadStream` — opens a file and returns a Web
 *     `ReadableStream<Uint8Array>` (rather than a Node `Readable`)
 *     so callers can pipe it directly into `fetch` bodies, our
 *     `S3ClientLike.write`, etc. The `Readable.toWeb` cast dance is
 *     not something every call site needs to know about.
 */

import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

/**
 * Returns whether the path exists and is reachable. Wraps
 * `access(p, F_OK)`; any error is treated as "does not exist".
 */
export async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Open a file for streaming reads. Returns a Web `ReadableStream` so
 * the result can be passed to `fetch` bodies, our `S3ClientLike.write`,
 * etc. Closes automatically when the consumer finishes reading.
 */
export function openReadStream(path: string): ReadableStream<Uint8Array> {
	return Readable.toWeb(
		createReadStream(path)
	) as unknown as NodeWebReadableStream<Uint8Array> as ReadableStream<Uint8Array>;
}
