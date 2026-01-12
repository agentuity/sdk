/**
 * Object Storage Agent
 *
 * File storage using Bun's S3-compatible API. Store any file type - images, PDFs,
 * videos, etc. Unlike KV (small JSON values) or Vector (searchable text), Object
 * Storage is for binary files you need to upload, download, or share.
 *
 * Key feature: Presigned URLs let you generate temporary download links to share
 * with users without exposing your storage credentials.
 *
 * Operations shown:
 * - s3.file(key).write(data) - Upload a file
 * - s3.file(key).text() / .arrayBuffer() - Download file contents
 * - s3.file(key).exists() - Check if file exists
 * - s3.presign(key, { expiresIn }) - Generate temporary shareable URL
 * - s3.list({ prefix }) - List files in a directory
 *
 * Docs: https://preview.agentuity.dev/v1/Build/Storage/object
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { S3Client } from 'bun';

// TODO: Replace with `import { s3 } from "bun"` once runtime S3 patch covers .list()
// Issue: https://github.com/agentuity/sdk/issues/241
const s3 = new S3Client({ virtualHostedStyle: true });

const prefix = 'sdk-explorer/';

// Sample file for seeding
const SAMPLE_FILE = {
	filename: 'hello.txt',
	content:
		'Hello from Agentuity Object Storage!\n\nThis is a sample file demonstrating the Bun S3 API.',
	contentType: 'text/plain',
};

const InputSchema = s.union(
	s.object({
		action: s.literal('download'),
		filename: s.string(),
	}),
	s.object({
		action: s.literal('list'),
	}),
	s.object({
		action: s.literal('presign'),
		filename: s.string(),
		expiresIn: s.optional(s.number()),
	}),
	s.object({
		action: s.literal('seed'),
	})
);

const agent = createAgent('objectstore', {
	description: 'File storage using Bun S3 API (download, list, presign)',
	schema: {
		input: InputSchema,
		output: s.object({
			success: s.boolean(),
			message: s.string(),
			data: s.optional(s.unknown()),
		}),
	},
	handler: async (ctx, input) => {
		switch (input.action) {
			case 'download': {
				const key = `${prefix}${input.filename}`;

				try {
					const file = s3.file(key);

					if (!(await file.exists())) {
						return {
							success: false,
							message: `File "${input.filename}" not found`,
						};
					}

					const content = await file.text();
					const stat = await file.stat();

					return {
						success: true,
						message: `Downloaded "${input.filename}"`,
						data: {
							filename: input.filename,
							content,
							size: stat?.size,
							contentType: stat?.type,
						},
					};
				} catch (error) {
					ctx.logger.error('Download failed', { error, key });
					return {
						success: false,
						message: error instanceof Error ? error.message : 'Download failed',
					};
				}
			}

			case 'list': {
				try {
					const objects = await s3.list({ prefix, maxKeys: 100 });

					const files =
						objects.contents?.map((obj) => ({
							key: obj.key,
							filename: obj.key?.replace(prefix, '') || obj.key,
							size: obj.size,
							lastModified: obj.lastModified,
						})) || [];

					return {
						success: true,
						message: `Found ${files.length} file(s)`,
						data: files,
					};
				} catch (error) {
					ctx.logger.error('List failed', { error });
					return {
						success: false,
						message: error instanceof Error ? error.message : 'List failed',
						data: [],
					};
				}
			}

			case 'presign': {
				const key = `${prefix}${input.filename}`;
				const expiresIn = input.expiresIn || 3600;

				try {
					const url = s3.presign(key, {
						expiresIn,
						method: 'GET',
					});

					return {
						success: true,
						message: `Presigned URL for "${input.filename}" (expires in ${expiresIn}s)`,
						data: { url, filename: input.filename, expiresIn },
					};
				} catch (error) {
					ctx.logger.error('Presign failed', { error, key });
					return {
						success: false,
						message: error instanceof Error ? error.message : 'Presign failed',
					};
				}
			}

			case 'seed': {
				const key = `${prefix}${SAMPLE_FILE.filename}`;

				try {
					// Check if file already exists
					const file = s3.file(key);
					if (await file.exists()) {
						return {
							success: false,
							message: 'Sample file already loaded',
							data: { filename: SAMPLE_FILE.filename },
						};
					}

					// Upload sample file
					const data = new TextEncoder().encode(SAMPLE_FILE.content);
					await file.write(data, { type: SAMPLE_FILE.contentType });

					ctx.logger.info('Sample file uploaded', {
						key,
						size: data.length,
					});

					return {
						success: true,
						message: `Loaded sample file "${SAMPLE_FILE.filename}"`,
						data: {
							filename: SAMPLE_FILE.filename,
							size: data.length,
							contentType: SAMPLE_FILE.contentType,
						},
					};
				} catch (error) {
					ctx.logger.error('Seed failed', { error, key });
					return {
						success: false,
						message: error instanceof Error ? error.message : 'Seed failed',
					};
				}
			}

			default:
				return {
					success: false,
					message: `Unknown action: ${(input as { action: string }).action}`,
				};
		}
	},
});

export default agent;
