import { StructuredError } from '@agentuity/core';
import { VECTOR_STORE_NAME } from '../../config';
import { processDoc } from './docs-processor';
import type { FilePayload, SyncPayload, SyncStats } from './types';

const CONCURRENCY = 5;

const Base64DecodeError = StructuredError('Base64DecodeError')<{
	path: string;
}>();

/**
 * Delete vector keys individually with bounded concurrency.
 * Uses single-key DELETE /vector/:name/:key to avoid the batch delete bug
 * where DELETE /vector/:name with multiple keys deletes the entire namespace.
 */
async function deleteKeys(ctx: any, namespace: string, keys: string[]): Promise<number> {
	let deleted = 0;
	for (let i = 0; i < keys.length; i += CONCURRENCY) {
		const batch = keys.slice(i, i + CONCURRENCY);
		const results = await Promise.all(batch.map((key) => ctx.vector.delete(namespace, key)));
		for (const count of results) {
			deleted += count;
		}
	}
	return deleted;
}

/**
 * Helper to remove all vectors for a given logical path from the vector store.
 *
 * CONTRACT RISK: The VectorStorage interface has no list-by-metadata API.
 * We use ctx.vector.search() with a throwaway query ('anything') and a metadata
 * filter as a workaround. This works because the metadata filter is applied
 * server-side after the semantic search, but it means:
 *   1. Results are limited by the semantic relevance of 'anything', so vectors
 *      with very short or unusual documents could theoretically be missed.
 *   2. If the backend changes how metadata filters interact with similarity
 *      thresholds, this listing pattern could silently return fewer results.
 * A dedicated vector.list({ metadata }) API would eliminate this risk.
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
		const deletedCount = await deleteKeys(ctx, vectorStoreName, keys);
		totalDeleted += deletedCount;

		if (deletedCount === 0) {
			ctx.logger.warn('Vector delete returned 0 for path: %s, aborting loop', logicalPath);
			break;
		}
	}

	// Verify deletion was complete
	const remaining = await ctx.vector.search(vectorStoreName, {
		query: 'anything',
		limit: 1,
		metadata: { path: logicalPath },
	});
	if (remaining.length > 0) {
		ctx.logger.warn('Vectors still exist after deletion for path: %s', logicalPath);
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
			throw new Base64DecodeError({ path: logicalPath, message: 'Malformed base64 payload' });
		}
		content = buf.toString('utf-8');
	} catch (decodeErr) {
		if (decodeErr instanceof Base64DecodeError) throw decodeErr;
		throw new Base64DecodeError({
			path: logicalPath,
			message: `Invalid base64 content for ${logicalPath}`,
			cause: decodeErr,
		});
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

			for (const [j, result] of results.entries()) {
				const logicalPath = batch[j];
				if (!logicalPath) continue;
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
		let changedProcessed = 0;
		let changedErrors = 0;

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

			for (const [j, result] of results.entries()) {
				const file = batch[j];
				if (!file) continue;
				if (result.status === 'fulfilled') {
					processed++;
					changedProcessed++;
					ctx.logger.info('Processed %s (%d chunks)', file.path, result.value);
				} else {
					errors++;
					changedErrors++;
					errorFiles.push(file.path);
					ctx.logger.error('Failed to process %s: %s', file.path, result.reason);
				}
			}

			ctx.logger.info(
				'Batch %d/%d complete in %dms (%d/%d files done)',
				batchIndex,
				totalBatches,
				Date.now() - batchStart,
				changedProcessed + changedErrors,
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

/**
 * Remove all vectors from the store. Uses the same search-as-listing workaround
 * as removeVectorsByPath; see the CONTRACT RISK note above.
 */
export async function clearVectorDb(ctx: any) {
	ctx.logger.info('Clearing all vectors from store: %s', VECTOR_STORE_NAME);
	while (true) {
		const batch = await ctx.vector.search(VECTOR_STORE_NAME, {
			query: 'anything',
			limit: 1000,
		});
		if (batch.length === 0) break;

		const keys = batch.map((v: { key: string }) => v.key);
		const deletedCount = await deleteKeys(ctx, VECTOR_STORE_NAME, keys);
		if (deletedCount === 0) {
			ctx.logger.warn('Vector delete returned 0 during clearVectorDb, aborting loop');
			break;
		}
	}
}
