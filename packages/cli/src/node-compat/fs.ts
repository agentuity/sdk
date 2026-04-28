/**
 * File system primitives for `@agentuity/cli`.
 *
 * Replaces direct `Bun.file(...)` / `Bun.write(...)` calls with thin
 * wrappers around `node:fs/promises`. The shapes here are tuned to
 * the CLI's actual needs (mostly "does this exist?" / "give me the
 * content as text or JSON" / "write this string or buffer"), not to
 * be a general-purpose filesystem library.
 *
 * Why the shim layer:
 *
 * - `Bun.file(p).exists()` involves `stat` under the hood. `node:fs`
 *   has no direct `exists()` either; the canonical replacement is
 *   `access(p, F_OK)` wrapped in a try/catch returning a boolean.
 *   Centralizing the wrapper keeps that ugly pattern out of every
 *   call site.
 * - `Bun.write(p, body)` accepts strings, Buffers, Uint8Arrays,
 *   `Bun.file(...)` handles, and Web `Response` objects. Node's
 *   `writeFile` accepts strings, Buffers, and Uint8Arrays only;
 *   anything stream-shaped needs to go through `pipeline` and
 *   `createWriteStream`. The dispatcher logic lives here.
 *
 * All functions throw on I/O errors (i.e., they do not silently swallow).
 * The `pathExists` predicate is the only function that translates
 * "absent" into a non-error return value.
 */

import { Buffer } from 'node:buffer';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, copyFile, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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

/** Read a file as UTF-8 text. */
export function readText(path: string): Promise<string> {
	return readFile(path, 'utf-8');
}

/**
 * Read a file as UTF-8 text and `JSON.parse` it.
 *
 * Throws on either I/O error or parse error; callers are expected to
 * handle both at the same level (typically wrapping in their own
 * domain-specific error).
 */
export async function readJson<T = unknown>(path: string): Promise<T> {
	const content = await readText(path);
	return JSON.parse(content) as T;
}

/**
 * Read a file as a `Buffer`. Use this when you need raw bytes for an
 * upload body or hashing. Prefer `readText` for human-readable
 * content and `streamFile` for very large files.
 */
export function readBytes(path: string): Promise<Buffer> {
	return readFile(path);
}

/** Get the size of a file in bytes. */
export async function fileSize(path: string): Promise<number> {
	const s = await stat(path);
	return s.size;
}

/** Write a string or `Buffer`/`Uint8Array` to disk, replacing the file. */
export function writeText(path: string, content: string): Promise<void> {
	return writeFile(path, content);
}

/** Write raw bytes to disk, replacing the file. */
export function writeBytes(
	path: string,
	bytes: Buffer | Uint8Array | ArrayBuffer | ArrayBufferView
): Promise<void> {
	const out =
		bytes instanceof ArrayBuffer
			? Buffer.from(bytes)
			: ArrayBuffer.isView(bytes)
				? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
				: bytes;
	return writeFile(path, out);
}

/**
 * Stream the body of a Web `Response` (or any `ReadableStream`) into
 * a file. Useful for downloading large blobs without buffering the
 * full body in memory first.
 */
export async function streamToFile(
	source: ReadableStream<Uint8Array> | NodeWebReadableStream<Uint8Array> | Response,
	destPath: string
): Promise<void> {
	const stream =
		source instanceof Response
			? source.body
			: (source as ReadableStream<Uint8Array> | NodeWebReadableStream<Uint8Array>);
	if (!stream) {
		throw new Error('streamToFile: source body is null');
	}
	const nodeStream = Readable.fromWeb(stream as unknown as NodeWebReadableStream<Uint8Array>);
	await pipeline(nodeStream, createWriteStream(destPath));
}

/**
 * Open a file for streaming reads. Returns a Web `ReadableStream` so
 * the result can be passed to `fetch` bodies, our `S3ClientLike.write`,
 * etc. Closes automatically when the consumer finishes reading.
 */
export function openReadStream(path: string): ReadableStream<Uint8Array> {
	return Readable.toWeb(createReadStream(path)) as unknown as ReadableStream<Uint8Array>;
}

/**
 * Delete a file. No-op if the file does not exist (matches
 * `Bun.file(p).delete()`'s tolerant behavior). Throws on permission /
 * device errors.
 */
export async function removeFile(path: string): Promise<void> {
	await rm(path, { force: true });
}

/** Copy a file from `src` to `dest`, overwriting if `dest` exists. */
export function copyFileTo(src: string, dest: string): Promise<void> {
	return copyFile(src, dest);
}
