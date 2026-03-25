import { createWriteStream } from 'node:fs';

/**
 * Stream a ReadableStream of raw bytes to a file on disk.
 *
 * This mirrors the pattern used by the deploy fork wrapper to capture child
 * process stdout/stderr without accumulating the output in memory.  Returns
 * the total number of bytes written.
 */
export async function captureStreamToFile(
	stream: ReadableStream<Uint8Array>,
	filePath: string
): Promise<number> {
	const writer = createWriteStream(filePath);
	const reader = stream.getReader();
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const ok = writer.write(value);
			totalBytes += value.byteLength;

			// Respect backpressure: wait for drain when the internal buffer is full
			if (!ok) {
				await new Promise<void>((resolve) => writer.once('drain', resolve));
			}
		}
	} finally {
		await new Promise<void>((resolve, reject) => {
			writer.once('error', reject);
			writer.end(resolve);
		});
	}

	return totalBytes;
}
