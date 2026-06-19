import { describe, expect, test } from 'bun:test';
import { normalizeWriteBody } from '../src/bun.ts';

/**
 * Regression coverage for the Bun upload corruption.
 *
 * On Bun 1.3.x, `Bun.S3Client.write` does not consume a Web
 * `ReadableStream` body: it string-coerces it to the 23-byte literal
 * `"[object ReadableStream]"` and stores that instead of the file's
 * bytes (verified on Bun 1.3.14). `normalizeWriteBody` is the guard — it
 * must buffer a stream to its exact bytes before the client ever sees it.
 *
 * The helper is tested directly rather than through
 * `createS3Client().write()` because Bun's built-in `bun` module — where
 * `S3Client` comes from — cannot be overridden via `mock.module`, so a
 * full-path unit test would require a live S3 endpoint.
 */

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});
}

describe('normalizeWriteBody (Bun upload body guard)', () => {
	test('buffers a Web ReadableStream to its exact bytes', async () => {
		// Payload length is deliberately != 23 so a "[object ReadableStream]"
		// corruption would be unmistakable.
		const payload = new TextEncoder().encode('bun-stream-payload-ABCDEFGHIJKLMNOP-0123456789\n');

		const out = await normalizeWriteBody(streamOf(payload));

		// Must be materialized bytes, never a stream (which Bun coerces to
		// the 23-byte "[object ReadableStream]").
		expect(out).toBeInstanceOf(Uint8Array);
		expect(out instanceof ReadableStream).toBe(false);
		const bytes = out as Uint8Array;
		expect(bytes.byteLength).toBe(payload.byteLength);
		expect(bytes).toEqual(payload);
	});

	test('passes non-stream bodies through unchanged', async () => {
		// string / Uint8Array / Blob are stored losslessly by Bun, so the
		// guard must not touch them.
		const text = 'plain-text-body';
		expect(await normalizeWriteBody(text)).toBe(text);

		const u8 = new TextEncoder().encode('uint8-body');
		expect(await normalizeWriteBody(u8)).toBe(u8);

		const blob = new Blob(['blob-body']);
		expect(await normalizeWriteBody(blob)).toBe(blob);
	});
});
