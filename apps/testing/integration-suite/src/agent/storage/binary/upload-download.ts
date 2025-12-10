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
			data: s.any().optional(), // Binary data (as array for JSON serialization)
			contentType: s.string().optional(), // MIME type
			md5: s.string().optional(), // Expected MD5 for verification
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			streamId: s.string().optional(),
			name: s.string().optional(),
			md5: s.string().optional(), // MD5 hash of data
			data: s.any().optional(), // Downloaded data (as array)
			contentType: s.string().optional(),
			size: s.number().optional(), // Size in bytes
		}),
	},
	handler: async (ctx, input) => {
		const { operation, name, streamId, data, contentType } = input;

		switch (operation) {
			case 'upload': {
				if (!name || !data) {
					throw new Error('Name and data required for upload');
				}

				// Convert array back to Uint8Array
				const binaryData = new Uint8Array(data);

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
				const chunks: Uint8Array[] = [];
				for await (const chunk of readable as any) {
					chunks.push(chunk);
				}

				// Combine chunks
				const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
				const combined = new Uint8Array(totalLength);
				let offset = 0;
				for (const chunk of chunks) {
					combined.set(chunk, offset);
					offset += chunk.length;
				}

				// Calculate MD5 hash
				const md5Hash = crypto.createHash('md5').update(combined).digest('hex');

				// Convert to array for JSON serialization
				const dataArray = Array.from(combined);

				return {
					operation,
					success: true,
					streamId,
					md5: md5Hash,
					data: dataArray,
					size: combined.length,
				};
			}

			case 'verify': {
				if (!data || !input.md5) {
					throw new Error('Data and expected MD5 required for verification');
				}

				// Convert array back to Uint8Array
				const binaryData = new Uint8Array(data);

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
