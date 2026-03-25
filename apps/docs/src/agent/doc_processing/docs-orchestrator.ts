import { VECTOR_STORE_NAME } from '../../config';
import { processDoc } from './docs-processor';
import type { FilePayload, SyncPayload, SyncStats } from './types';

const CONCURRENCY = 5;

/**
 * Helper to remove all vectors for a given logical path from the vector store.
 */
async function removeVectorsByPath(ctx: any, logicalPath: string, vectorStoreName: string) {
	let totalDeleted = 0;

	while (true) {
		const vectors = await ctx.vector.search(vectorStoreName, {
			query: 'anything',
			limit: 100,
			metadata: { path: logicalPath },
		});

		if (vectors.length === 0) {
			break;
		}

		const keys = vectors.map((v: { key: string }) => v.key);
		const deletedCount = await ctx.vector.delete(vectorStoreName, ...keys);
		totalDeleted += deletedCount;

		if (deletedCount === 0) {
			ctx.logger.warn('Vector delete returned 0 for path: %s, aborting loop', logicalPath);
			break;
		}
	}

	if (totalDeleted > 0) {
		ctx.logger.info('Removed %d vectors for path: %s', totalDeleted, logicalPath);
	}
}

/**
 * Process a single changed file: decode, remove old vectors, chunk, embed, upsert.
 */
async function processChangedFile(ctx: any, file: FilePayload): Promise<number> {
	const { path: logicalPath, content: base64Content } = file;

	let content: string;
	try {
		const buf = Buffer.from(base64Content, 'base64');
		if (buf.toString('base64') !== base64Content.replace(/\s/g, '')) {
			throw new Error('Malformed base64 payload');
		}
		content = buf.toString('utf-8');
	} catch (decodeErr) {
		throw new Error(`Invalid base64 content for ${logicalPath}: ${decodeErr}`);
	}

	await removeVectorsByPath(ctx, logicalPath, VECTOR_STORE_NAME);

	const chunks = await processDoc(content);

	const chunksWithMetadata = chunks.map((chunk) => ({
		...chunk,
		metadata: {
			...chunk.metadata,
			path: logicalPath,
		},
	}));

	if (chunksWithMetadata.length > 0) {
		await ctx.vector.upsert(VECTOR_STORE_NAME, ...chunksWithMetadata);
	}

	return chunks.length;
}

/**
 * Process documentation sync from embedded payload.
 * Files are processed in parallel batches for throughput.
 */
export async function syncDocsFromPayload(ctx: any, payload: SyncPayload): Promise<SyncStats> {
	const { changed = [], removed = [] } = payload;
	const syncStart = Date.now();
	let processed = 0;
	let deleted = 0;
	let errors = 0;
	const errorFiles: string[] = [];

	// Process removed files in parallel batches
	if (removed.length > 0) {
		ctx.logger.info('Removing %d files from vector store', removed.length);

		for (let i = 0; i < removed.length; i += CONCURRENCY) {
			const batch = removed.slice(i, i + CONCURRENCY);
			const results = await Promise.allSettled(
				batch.map((logicalPath) => removeVectorsByPath(ctx, logicalPath, VECTOR_STORE_NAME))
			);

			for (let j = 0; j < results.length; j++) {
				const result = results[j];
				const logicalPath = batch[j];
				if (result.status === 'fulfilled') {
					deleted++;
				} else {
					errors++;
					errorFiles.push(logicalPath);
					ctx.logger.error('Failed to remove %s: %s', logicalPath, result.reason);
				}
			}
		}

		ctx.logger.info('Removals complete: %d deleted, %d errors', deleted, errors);
	}

	// Process changed files in parallel batches
	if (changed.length > 0) {
		const totalFiles = changed.length;
		const totalBatches = Math.ceil(totalFiles / CONCURRENCY);
		ctx.logger.info(
			'Processing %d changed files in %d batches (concurrency: %d)',
			totalFiles,
			totalBatches,
			CONCURRENCY
		);

		for (let i = 0; i < changed.length; i += CONCURRENCY) {
			const batchIndex = Math.floor(i / CONCURRENCY) + 1;
			const batch = changed.slice(i, i + CONCURRENCY);
			const batchStart = Date.now();

			ctx.logger.info(
				'Batch %d/%d: processing files %d-%d of %d',
				batchIndex,
				totalBatches,
				i + 1,
				Math.min(i + CONCURRENCY, totalFiles),
				totalFiles
			);

			const results = await Promise.allSettled(
				batch.map((file) => processChangedFile(ctx, file))
			);

			for (let j = 0; j < results.length; j++) {
				const result = results[j];
				const file = batch[j];
				if (result.status === 'fulfilled') {
					processed++;
					ctx.logger.info('Processed %s (%d chunks)', file.path, result.value);
				} else {
					errors++;
					errorFiles.push(file.path);
					ctx.logger.error('Failed to process %s: %s', file.path, result.reason);
				}
			}

			ctx.logger.info(
				'Batch %d/%d complete in %dms (%d/%d files done)',
				batchIndex,
				totalBatches,
				Date.now() - batchStart,
				processed + errors,
				totalFiles
			);
		}
	}

	const stats = { processed, deleted, errors, errorFiles };
	const duration = Date.now() - syncStart;
	ctx.logger.info(
		'Sync completed in %dms: %d processed, %d deleted, %d errors',
		duration,
		processed,
		deleted,
		errors
	);

	if (errorFiles.length > 0) {
		ctx.logger.warn('Failed files: %o', errorFiles);
	}

	return stats;
}

export async function clearVectorDb(ctx: any) {
	ctx.logger.info('Clearing all vectors from store: %s', VECTOR_STORE_NAME);
	while (true) {
		const batch = await ctx.vector.search(VECTOR_STORE_NAME, {
			query: 'anything',
			limit: 1000,
		});
		if (batch.length === 0) break;

		const keys = batch.map((v: { key: string }) => v.key);
		await ctx.vector.delete(VECTOR_STORE_NAME, ...keys);
	}
}
