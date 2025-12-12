/**
 * Binary Storage Agent
 *
 * Handles upload and download of binary data via Stream storage.
 * Tests binary integrity with MD5 verification.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import crypto from 'crypto';

const binaryStorageAgent = createAgent('storage-binary-upload-download', {
	description: 'Upload and download binary data with integrity verification',
	schema: {
		input: s.object({
			operation: s.string(), // 'upload', 'download', 'verify'
			name: s.string().optional(), // Stream name
			streamId: s.string().optional(), // Stream ID for download
			data: s.string().optional(), // Binary data (base64-encoded)
			contentType: s.string().optional(), // MIME type
			md5: s.string().optional(), // Expected MD5 for verification
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			streamId: s.string().optional(),
			name: s.string().optional(),
			md5: s.string().optional(), // MD5 hash of data
			data: s.string().optional(), // Downloaded data (base64-encoded)
			contentType: s.string().optional(),
			size: s.number().optional(), // Size in bytes
		}),
	},
	handler: async (ctx, input) => {
		const { operation, name, streamId, data, contentType } = input;

		switch (operation) {
			case 'upload': {
				if (!name || data === undefined) {
					throw new Error('Name and data required for upload');
				}

				// Decode base64 to Uint8Array
				const binaryData = Buffer.from(data, 'base64');

				// Calculate MD5 hash
				const md5Hash = crypto.createHash('md5').update(binaryData).digest('hex');

				// Create stream
				const stream = await ctx.stream.create(name, {
					contentType: contentType || 'application/octet-stream',
					metadata: {
						md5: md5Hash,
						size: binaryData.length.toString(),
						uploadedAt: new Date().toISOString(),
					},
				});

				// Write data
				await stream.write(binaryData);

				// Close stream
				await stream.close();

				return {
					operation,
					success: true,
					streamId: stream.id as string,
					name,
					md5: md5Hash,
					contentType: contentType || 'application/octet-stream',
					size: binaryData.length,
				};
			}

			case 'download': {
				if (!streamId) {
					throw new Error('Stream ID required for download');
				}

				// Download stream
				const readable = await ctx.stream.download(streamId);

				// Read chunks
				const chunks: Buffer[] = [];
				let idx = 0;
				for await (const chunk of readable as any) {
					// Normalize to Buffer
					const buf = Buffer.isBuffer(chunk)
						? chunk
						: chunk instanceof Uint8Array
							? Buffer.from(chunk)
							: Buffer.from(chunk);

					chunks.push(buf);
					idx++;
				}

				// Combine chunks
				const combined = Buffer.concat(chunks);

				// Calculate MD5 hash
				const md5Hash = crypto.createHash('md5').update(combined).digest('hex');

				// Convert to base64 for JSON serialization
				const dataBase64 = combined.toString('base64');

				return {
					operation,
					success: true,
					streamId,
					md5: md5Hash,
					data: dataBase64,
					size: combined.length,
				};
			}

			case 'verify': {
				if (!data || !input.md5) {
					throw new Error('Data and expected MD5 required for verification');
				}

				// Decode base64 to Buffer
				const binaryData = Buffer.from(data, 'base64');

				// Calculate MD5 hash
				const actualMd5 = crypto.createHash('md5').update(binaryData).digest('hex');

				return {
					operation,
					success: actualMd5 === input.md5,
					md5: actualMd5,
					size: binaryData.length,
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default binaryStorageAgent;
