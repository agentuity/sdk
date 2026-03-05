import { VECTOR_STORE_NAME } from '../../config';
import { processDoc } from './docs-processor';
import type { SyncPayload, SyncStats } from './types';

async function processInBatches<T, R>(
	items: T[],
	batchSize: number,
	fn: (item: T) => Promise<R>,
	onBatchDone?: (batchIndex: number, batchSize: number, elapsedMs: number) => void
): Promise<R[]> {
	const results: R[] = [];
	let batchIndex = 0;
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchStart = Date.now();
		results.push(...(await Promise.all(batch.map(fn))));
		onBatchDone?.(batchIndex, batch.length, Date.now() - batchStart);
		batchIndex++;
	}
	return results;
}

/**
 * Helper to remove all vectors for a given logical path from the vector store.
 */
async function removeVectorsByPath(ctx: any, logicalPath: string, vectorStoreName: string) {
	ctx.logger.info('Removing vectors for path: %s', logicalPath);

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

		// Batch delete all vectors at once for efficiency
		const keys = vectors.map((v: { key: string }) => v.key);
		const deletedCount = await ctx.vector.delete(vectorStoreName, ...keys);
		totalDeleted += deletedCount;

		ctx.logger.debug(
			'Deleted %d vectors (total: %d) for path: %s',
			deletedCount,
			totalDeleted,
			logicalPath
		);
	}

	if (totalDeleted > 0) {
		ctx.logger.info('Completed removal of %d vectors for path: %s', totalDeleted, logicalPath);
	} else {
		ctx.logger.debug('No vectors found for path: %s', logicalPath);
	}
}

/**
 * Process documentation sync from embedded payload - completely filesystem-free
 */
export async function syncDocsFromPayload(ctx: any, payload: SyncPayload): Promise<SyncStats> {
	const { changed = [], removed = [] } = payload;
	let processed = 0;
	let deleted = 0;
	let errors = 0;

	const errorFiles: string[] = [];
	const syncStart = Date.now();

	// Process removed files (batch size 10)
	const removeStart = Date.now();
	const removeResults = await processInBatches(removed, 10, async (logicalPath) => {
		try {
			await removeVectorsByPath(ctx, logicalPath, VECTOR_STORE_NAME);
			ctx.logger.debug('Successfully removed file: %s', logicalPath);
			return { success: true as const };
		} catch (err) {
			ctx.logger.error('Error deleting file %s: %o', logicalPath, err);
			return { success: false as const, path: logicalPath };
		}
	});

	for (const result of removeResults) {
		if (result.success) {
			deleted++;
		} else {
			errors++;
			errorFiles.push(result.path);
		}
	}
	const removeElapsed = Date.now() - removeStart;
	ctx.logger.info(
		'Removal phase: %d files in %dms (%d deleted, %d errors)',
		removed.length,
		removeElapsed,
		deleted,
		errors
	);

	// Process changed files with embedded content (batch size 5)
	const changeStart = Date.now();
	const totalBatches = Math.ceil(changed.length / 5);
	const changeResults = await processInBatches(changed, 5, async (file) => {
		try {
			const { path: logicalPath, content: base64Content } = file;

			// Base64-decode the content
			let content: string;
			try {
				const buf = Buffer.from(base64Content, 'base64');
				// re-encode to verify round-trip
				if (buf.toString('base64') !== base64Content.replace(/\s/g, '')) {
					throw new Error('Malformed base64 payload');
				}
				content = buf.toString('utf-8');
			} catch (decodeErr) {
				throw new Error(`Invalid base64 content for ${logicalPath}: ${decodeErr}`);
			}

			// Remove existing vectors for this path
			await removeVectorsByPath(ctx, logicalPath, VECTOR_STORE_NAME);

			// Process the document content into chunks
			const chunks = await processDoc(content);

			// Add path metadata to all chunks
			const chunksWithMetadata = chunks.map((chunk) => ({
				...chunk,
				metadata: {
					...chunk.metadata,
					path: logicalPath,
				},
			}));

			// Batch upsert all chunks at once for efficiency
			if (chunksWithMetadata.length > 0) {
				const upsertResults = await ctx.vector.upsert(VECTOR_STORE_NAME, ...chunksWithMetadata);
				ctx.logger.info('Upserted %d chunks for file: %s', upsertResults.length, logicalPath);
			}

			processed++;
			ctx.logger.info('Successfully processed file: %s (%d chunks)', logicalPath, chunks.length);
			return { success: true as const };
		} catch (err) {
			ctx.logger.error('Error processing file %s: %o', file.path, err);
			return { success: false as const, path: file.path };
		}
	}, (batchIndex, size, elapsedMs) => {
		ctx.logger.info(
			'Changed batch %d/%d (%d files) completed in %dms',
			batchIndex + 1,
			totalBatches,
			size,
			elapsedMs
		);
	});
	const changeElapsed = Date.now() - changeStart;
	ctx.logger.info(
		'Changed phase: %d files in %dms',
		changed.length,
		changeElapsed
	);

	for (const result of changeResults) {
		if (!result.success) {
			errors++;
			errorFiles.push(result.path);
		}
	}

	const totalElapsed = Date.now() - syncStart;
	const stats = { processed, deleted, errors, errorFiles };
	ctx.logger.info('Sync completed in %dms: %o', totalElapsed, stats);

	try {
		const storeStats = await ctx.vector.getStats(VECTOR_STORE_NAME);
		ctx.logger.info(
			'Vector store "%s" post-sync: %d vectors, %d bytes',
			VECTOR_STORE_NAME,
			storeStats.count,
			storeStats.sum
		);
		if (storeStats.count === 0 && processed > 0) {
			ctx.logger.error(
				'Vector store "%s" is empty after processing %d files. Possible capacity or eviction issue.',
				VECTOR_STORE_NAME,
				processed
			);
		}
	} catch (statsErr) {
		ctx.logger.error('Failed to retrieve vector store stats: %o', statsErr);
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

		// Batch delete all vectors at once for efficiency
		const keys = batch.map((v: { key: string }) => v.key);
		await ctx.vector.delete(VECTOR_STORE_NAME, ...keys);
	}
}
