import matter from 'gray-matter';
import type { Document } from 'langchain/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

/**
 * Type for a single enriched documentation chunk.
 * Includes all standard metadata and allows for additional frontmatter fields.
 */
export type Chunk = {
	id: string;
	chunkIndex: number;
	totalChunks: number;
	contentType: string;
	heading: string;
	text: string;
	title: string;
	description: string;
	createdAt: string;
};

export function detectContentType(textChunk: string): string {
	if (/^---\n.*?---/s.test(textChunk.trim())) {
		return 'frontmatter';
	}
	// Code blocks
	if (/```[\w]*\n.*?```/s.test(textChunk)) {
		return 'code_block';
	}
	// Headers with substantial content
	if (/^#{1,6}\s+/.test(textChunk.trim()) && textChunk.length > 100) {
		return 'header_section';
	}
	// Just headers (short)
	if (/^#{1,6}\s+/.test(textChunk.trim())) {
		return 'header';
	}
	// Tables (markdown tables)
	if (
		/\|.*\|.*\|/.test(textChunk) &&
		(textChunk.match(/\|/g) || []).length >= 4
	) {
		return 'table';
	}
	// Lists (multiple list items)
	const lines = textChunk.split('\n');
	const listLines = lines.filter((line) =>
		/^[-*+]\s+|^\d+\.\s+/.test(line.trim())
	);
	if (listLines.length >= 2) {
		return 'list';
	}
	return 'text';
}

export async function hybridChunkDocument(doc: Document) {
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 3000,
		chunkOverlap: 200,
		separators: ['\n## ', '\n### ', '\n\n', '\n'],
	});
	const chunks = await splitter.splitDocuments([doc]);

	for (const chunk of chunks) {
		chunk.metadata = chunk.metadata || {};
		chunk.metadata.contentType = detectContentType(chunk.pageContent);
	}

	return chunks;
}

/**
 * Chunks and enriches a single MDX doc with metadata.
 * - Parses and removes frontmatter
 * - Chunks markdown with heading-aware splitting at 3000 chars
 * - Enriches each chunk with: id, chunkIndex, contentType, heading, breadcrumbs, all frontmatter fields
 * @param fileContent Raw file content (with frontmatter)
 * @returns Array of enriched chunk objects (no keywords or embeddings yet)
 */
export async function chunkAndEnrichDoc(fileContent: string): Promise<Chunk[]> {
	const { content: markdownBody, data: frontmatter } = matter(fileContent);
	const doc = { pageContent: markdownBody, metadata: {} };
	const chunks = await hybridChunkDocument(doc);
	// Track heading and breadcrumbs as we walk through chunks
	let currentHeading = '';
	return chunks.map((chunk, idx) => {
		if (
			chunk.metadata.contentType === 'header' ||
			chunk.metadata.contentType === 'header_section'
		) {
			currentHeading = (chunk.pageContent?.split('\n')[0] ?? '')
				.replace(/^#+\s*/, '')
				.trim();
		}
		return {
			id: crypto.randomUUID(),
			chunkIndex: idx,
			totalChunks: chunks.length,
			contentType: chunk.metadata.contentType,
			heading: currentHeading,
			text: chunk.pageContent,
			title: frontmatter.title,
			description: frontmatter.description,
			createdAt: new Date().toISOString(),
		};
	});
}
