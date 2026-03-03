import { VECTOR_STORE_NAME } from '../../config.ts';
import { processDoc } from './docs-processor.ts';
import type { SyncPayload, SyncStats } from './types.ts';

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

		ctx.logger.info(
			'Deleted %d vectors (total: %d) for path: %s',
			deletedCount,
			totalDeleted,
			logicalPath
		);
	}

	if (totalDeleted > 0) {
		ctx.logger.info('Completed removal of %d vectors for path: %s', totalDeleted, logicalPath);
	} else {
		ctx.logger.info('No vectors found for path: %s', logicalPath);
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

	// Process removed files
	for (const logicalPath of removed) {
		try {
			await removeVectorsByPath(ctx, logicalPath, VECTOR_STORE_NAME);
			deleted++;
			ctx.logger.info('Successfully removed file: %s', logicalPath);
		} catch (err) {
			errors++;
			errorFiles.push(logicalPath);
			ctx.logger.error('Error deleting file %s: %o', logicalPath, err);
		}
	}

	// Process changed files with embedded content
	for (const file of changed) {
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
		} catch (err) {
			errors++;
			errorFiles.push(file.path);
			ctx.logger.error('Error processing file %s: %o', file.path, err);
		}
	}

	const stats = { processed, deleted, errors, errorFiles };
	ctx.logger.info('Sync completed: %o', stats);
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
