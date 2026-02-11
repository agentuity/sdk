
import { VECTOR_STORE_NAME, vectorSearchNumber } from '../../config';
import type { RelevantDoc } from './types';

/**
 * Expands a group of chunks from the same path by creating a set of all needed chunk indices
 * and querying for them once
 */
async function expandPathGroup(
	ctx: any,
	path: string,
	pathChunks: Array<{
		path: string;
		title: string;
		content: string;
		relevanceScore?: number;
		chunkIndex?: number;
	}>
): Promise<RelevantDoc | null> {
	const contextWindow = 1; // Get 1 chunk before and after each chunk
	const expandedChunkIndices = new Set<number>();

	// Add neighbors for each chunk to the set
	for (const chunk of pathChunks) {
		if (chunk.chunkIndex !== undefined) {
			const targetIndex = chunk.chunkIndex;

			// Add the chunk itself and its neighbors
			expandedChunkIndices.add(targetIndex - contextWindow);
			expandedChunkIndices.add(targetIndex);
			expandedChunkIndices.add(targetIndex + contextWindow);
		}
	}

	// Remove negative indices
	const validIndices = Array.from(expandedChunkIndices).filter(
		(index) => index >= 0
	);

	if (validIndices.length === 0) {
		ctx.logger.warn('No valid chunk indices found for path: %s', path);
		return null;
	}

	// Sort indices
	validIndices.sort((a, b) => a - b);

	try {
		// Query for all chunks at once
		const chunkQueries = validIndices.map((index) =>
			ctx.vector.search(VECTOR_STORE_NAME, {
				query: path,
				limit: 1,
				metadata: { path: path, chunkIndex: index },
			})
		);

		const results = await Promise.all(chunkQueries);

		// Collect found chunks
		const foundChunks: Array<{ index: number; text: string }> = [];

		for (const result of results) {
			if (result.length > 0 && result[0] && result[0].metadata) {
				const metadata = result[0].metadata;
				if (
					typeof metadata.chunkIndex === 'number' &&
					typeof metadata.text === 'string'
				) {
					foundChunks.push({
						index: metadata.chunkIndex,
						text: metadata.text,
					});
				}
			}
		}

		if (foundChunks.length === 0) {
			ctx.logger.warn('No chunks found for path: %s', path);
			return null;
		}

		// Sort by index and combine content
		const sortedChunks = foundChunks.sort((a, b) => a.index - b.index);
		const expandedContent = sortedChunks
			.map((chunk) => chunk.text)
			.join('\n\n');

		// Find the best relevance score from the original chunks
		const bestScore = Math.max(
			...pathChunks.map((chunk) => chunk.relevanceScore || 0)
		);

		// Create chunk range
		const minIndex = Math.min(...sortedChunks.map((c) => c.index));
		const maxIndex = Math.max(...sortedChunks.map((c) => c.index));
		const chunkRange =
			minIndex === maxIndex ? `${minIndex}` : `${minIndex}-${maxIndex}`;

		ctx.logger.debug(
			'Expanded path %s with %d chunks (range: %s) score %d',
			path,
			foundChunks.length,
			chunkRange,
			bestScore
		);

		// Use the title from the first chunk (all chunks from same doc have same title)
		const title = pathChunks[0]?.title || path;

		return {
			path,
			title,
			content: expandedContent,
			relevanceScore: bestScore,
			chunkRange,
			chunkIndex: undefined, // Not applicable for grouped chunks
		};
	} catch (err) {
		ctx.logger.error('Error expanding path group %s: %o', path, err);
		return null;
	}
}

export async function retrieveRelevantDocs(
	ctx: any,
	prompt: string
): Promise<RelevantDoc[]> {
	const dbQuery = {
		query: prompt,
		limit: vectorSearchNumber,
	};
	try {
		const vectors = await ctx.vector.search(VECTOR_STORE_NAME, dbQuery);

		ctx.logger.debug(
			'Vector search returned %d results. First vector structure: %o',
			vectors.length,
			vectors[0]
		);

		// Process each relevant chunk and expand with context
		const relevantChunks: Array<{
			path: string;
			title: string;
			content: string;
			relevanceScore?: number;
			chunkIndex?: number;
		}> = [];

		for (const vector of vectors) {
			if (!vector.metadata) {
				ctx.logger.warn('Vector missing metadata, skipping');
				continue;
			}

			const path =
				typeof vector.metadata.path === 'string'
					? vector.metadata.path
					: undefined;
			const title =
				typeof vector.metadata.title === 'string'
					? vector.metadata.title
					: path || 'Documentation';
			const text =
				typeof vector.metadata.text === 'string' ? vector.metadata.text : '';
			const chunkIndex =
				typeof vector.metadata.chunkIndex === 'number'
					? vector.metadata.chunkIndex
					: undefined;

			if (!path) {
				ctx.logger.warn('Vector metadata path is not a string, skipping');
				continue;
			}

			const relevanceScore = (vector as any).similarity;

			ctx.logger.debug(
				'Vector for path %s, chunk %d: similarity=%s, relevanceScore=%s',
				path,
				chunkIndex,
				(vector as any).similarity,
				relevanceScore
			);

			relevantChunks.push({
				path,
				title,
				content: text,
				relevanceScore,
				chunkIndex: chunkIndex,
			});
		}

		// Group chunks by path
		const chunksByPath = new Map<
			string,
			Array<{
				path: string;
				title: string;
				content: string;
				relevanceScore?: number;
				chunkIndex?: number;
			}>
		>();

		for (const chunk of relevantChunks) {
			if (!chunksByPath.has(chunk.path)) {
				chunksByPath.set(chunk.path, []);
			}
			const pathChunks = chunksByPath.get(chunk.path);
			if (pathChunks) {
				pathChunks.push(chunk);
			}
		}

		// Expand each path group together
		const relevantDocs: RelevantDoc[] = [];

		for (const [path, pathChunks] of chunksByPath) {
			const expandedDoc = await expandPathGroup(ctx, path, pathChunks);
			if (expandedDoc) {
				relevantDocs.push(expandedDoc);
			}
		}

		ctx.logger.info(
			'Retrieved and expanded %d relevant chunks from vector search',
			relevantDocs.length
		);
		return relevantDocs;
	} catch (err) {
		ctx.logger.error('Error retrieving relevant docs: %o', err);
		return [];
	}
}
