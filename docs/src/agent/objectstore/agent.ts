/**
 * Object Storage Explorer demo
 *
 * File storage using @agentuity/storage. Store any file type - images, PDFs,
 * videos, etc. Unlike KV (small JSON values) or Vector (searchable text), Object
 * Storage is for binary files that users need to upload, download, or share.
 *
 * Key feature: Presigned URLs let you generate temporary download links to share
 * with users without exposing your storage credentials.
 *
 * Operations shown:
 * - storage.write(key, data) - Upload a file
 * - storage.file(key).text() / .arrayBuffer() - Download file contents
 * - storage.stat(key) - Check object metadata
 * - Bun S3Client.presign(key, { expiresIn }) - Generate temporary shareable URL
 * - storage.list({ prefix }) - List files in a directory
 *
 * Docs: https://agentuity.dev/services/storage/object
 */
import { defineDemoAgent } from '../demo-agent';
import { s } from '@agentuity/schema';
import type { S3ClientLike } from '@agentuity/storage';
import {
	createObjectStorageClient,
	createObjectStoragePresignedUrl,
	isObjectStorageConfigurationError,
	objectStorageNotConfiguredMessage,
} from '../../lib/demo-object-storage';

const prefix = 'sdk-explorer/';

// Sample file for seeding
const SAMPLE_FILE = {
	filename: 'hello.txt',
	content:
		'Hello from Agentuity Object Storage!\n\nThis is a sample file demonstrating @agentuity/storage.',
	contentType: 'text/plain',
};

function createStorage(): S3ClientLike {
	return createObjectStorageClient();
}

function isMissingObjectError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error.code === 'NoSuchKey' || error.code === 'NotFound')
	);
}

async function objectExists(storage: S3ClientLike, key: string): Promise<boolean> {
	try {
		await storage.stat(key);
		return true;
	} catch (error) {
		if (isMissingObjectError(error)) return false;
		throw error;
	}
}

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

const agent = defineDemoAgent('objectstore', {
	description: 'File storage using @agentuity/storage (download, list, presign)',
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
					const storage = createStorage();

					if (!(await objectExists(storage, key))) {
						return {
							success: false,
							message: `File "${input.filename}" not found`,
						};
					}

					const file = storage.file(key);
					const content = await file.text();
					const stat = await storage.stat(key);

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
					if (isObjectStorageConfigurationError(error)) {
						return {
							success: false,
							message: objectStorageNotConfiguredMessage,
						};
					}

					ctx.logger.error('Download failed', { error, key });
					return {
						success: false,
						message: error instanceof Error ? error.message : 'Download failed',
					};
				}
			}

			case 'list': {
				try {
					const storage = createStorage();
					const objects = await storage.list({ prefix, maxKeys: 100 });

					const files =
						objects.contents.map((obj) => ({
							key: obj.key,
							filename: obj.key.replace(prefix, '') || obj.key,
							size: obj.size,
							lastModified: obj.lastModified,
						})) || [];

					return {
						success: true,
						message: `Found ${files.length} file(s)`,
						data: files,
					};
				} catch (error) {
					if (isMissingObjectError(error)) {
						return {
							success: true,
							message: 'Found 0 file(s)',
							data: [],
						};
					}

					if (isObjectStorageConfigurationError(error)) {
						return {
							success: false,
							message: objectStorageNotConfiguredMessage,
							data: [],
						};
					}

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
					const storage = createStorage();

					// presign() signs locally without calling S3, so a URL for a missing
					// object would look valid but 404 on open. Check existence first.
					if (!(await objectExists(storage, key))) {
						return {
							success: false,
							message: `File "${input.filename}" not found`,
						};
					}

					const url = createObjectStoragePresignedUrl(key, expiresIn);

					return {
						success: true,
						message: `Presigned URL for "${input.filename}" (expires in ${expiresIn}s)`,
						data: {
							url,
							urlType: 'presigned',
							filename: input.filename,
							expiresIn,
						},
					};
				} catch (error) {
					if (isObjectStorageConfigurationError(error)) {
						return {
							success: false,
							message: objectStorageNotConfiguredMessage,
						};
					}

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
					const storage = createStorage();
					if (await objectExists(storage, key)) {
						const existingContent = await storage.file(key).text();
						if (existingContent === SAMPLE_FILE.content) {
							return {
								success: false,
								message: 'Sample file already loaded',
								data: { filename: SAMPLE_FILE.filename },
							};
						}
					}

					const data = new TextEncoder().encode(SAMPLE_FILE.content);
					await storage.write(key, data, { type: SAMPLE_FILE.contentType });

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
					if (isObjectStorageConfigurationError(error)) {
						return {
							success: false,
							message: objectStorageNotConfiguredMessage,
						};
					}

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
