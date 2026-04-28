/**
 * Standard-input helpers.
 *
 * Replacement for `Bun.stdin.text()` and `Bun.stdin.stream()` using
 * Node's native `node:stream/consumers` and the runtime's web-stream
 * bridge.
 */

import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

/**
 * Read the entire stdin stream as UTF-8 text and resolve once stdin
 * closes (i.e., the parent stops feeding input or the pipe ends).
 */
export function readStdinText(): Promise<string> {
	return text(process.stdin);
}

/**
 * Get a Web `ReadableStream<Uint8Array>` view of stdin so the chunks
 * can be piped to a `fetch` body or our `S3ClientLike.write`.
 */
export function stdinWebStream(): ReadableStream<Uint8Array> {
	return Readable.toWeb(
		process.stdin
	) as unknown as NodeWebReadableStream<Uint8Array> as ReadableStream<Uint8Array>;
}
