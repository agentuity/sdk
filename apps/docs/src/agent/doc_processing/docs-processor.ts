import type { VectorUpsertParams } from '@agentuity/core';
import type { Chunk } from './chunk-mdx';
import { chunkAndEnrichDoc } from './chunk-mdx';
import { embedChunks } from './embed-chunks';
import type { ChunkMetadata } from './types';

/**
 * Processes a single .mdx doc: loads, chunks, and enriches each chunk with metadata.
 * @param docContent Raw file content
 */
export async function processDoc(
	docContent: string
): Promise<VectorUpsertParams[]> {
	const chunks = await chunkAndEnrichDoc(docContent);
	const vectors = await createVectorEmbedding(chunks);
	return vectors;
}

async function createVectorEmbedding(
	chunks: Chunk[]
): Promise<VectorUpsertParams[]> {
	const embeddings = await embedChunks(chunks.map((chunk) => chunk.text));
	return chunks.map((chunk, index) => {
		if (!embeddings[index]) {
			throw new Error(`No embedding found for chunk ${chunk.id}`);
		}
		const metadata: ChunkMetadata = {
			chunkIndex: chunk.chunkIndex,
			totalChunks: chunk.totalChunks,
			contentType: chunk.contentType,
			heading: chunk.heading,
			title: chunk.title,
			description: chunk.description,
			text: chunk.text,
			createdAt: chunk.createdAt,
		};

		return {
			key: chunk.id,
			embeddings: embeddings[index],
			metadata,
		};
	});
}
