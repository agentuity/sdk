import type { VectorUpsertParams } from '@agentuity/vector';
import type { Chunk } from './chunk-mdx';
import { chunkAndEnrichDoc } from './chunk-mdx';
import type { ChunkMetadata } from './types';

/**
 * Processes a single .mdx doc: loads, chunks, and enriches each chunk with metadata.
 * @param docContent Raw file content
 */
export async function processDoc(docContent: string): Promise<VectorUpsertParams[]> {
	const chunks = await chunkAndEnrichDoc(docContent);
	return createVectorDocuments(chunks);
}

function createVectorDocuments(chunks: Chunk[]): VectorUpsertParams[] {
	return chunks.map((chunk) => {
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
			document: chunk.text,
			metadata,
		};
	});
}
