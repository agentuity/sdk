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

export function createContentAwareSplitter(contentType: string) {
	if (contentType === 'frontmatter') {
		return new RecursiveCharacterTextSplitter({
			chunkSize: 2000,
			chunkOverlap: 0,
			separators: ['\n---\n'],
		});
	} if (contentType === 'code_block') {
		return new RecursiveCharacterTextSplitter({
			chunkSize: 800,
			chunkOverlap: 100,
			separators: ['\n```\n', '\n\n', '\n'],
		});
	} if (contentType === 'header_section') {
		return new RecursiveCharacterTextSplitter({
			chunkSize: 1200,
			chunkOverlap: 150,
			separators: ['\n## ', '\n### ', '\n#### ', '\n\n', '\n'],
		});
	} if (contentType === 'table') {
		return new RecursiveCharacterTextSplitter({
			chunkSize: 1500,
			chunkOverlap: 0,
			separators: ['\n\n'],
		});
	} if (contentType === 'list') {
		return new RecursiveCharacterTextSplitter({
			chunkSize: 800,
			chunkOverlap: 100,
			separators: ['\n\n', '\n- ', '\n* ', '\n+ '],
		});
	}
	return new RecursiveCharacterTextSplitter({
		chunkSize: 1000,
		chunkOverlap: 200,
		separators: ['\n\n', '\n', ' '],
	});
}

export async function hybridChunkDocument(doc: Document) {
	const initialSplitter = new RecursiveCharacterTextSplitter({
		chunkSize: 2000,
		chunkOverlap: 100,
		separators: ['\n## ', '\n### ', '\n\n', '\n'],
	});
	const initialChunks = await initialSplitter.splitDocuments([doc]);
	const finalChunks: any[] = [];
	for (const chunk of initialChunks) {
		const contentType = detectContentType(chunk.pageContent);
		const contentSplitter = createContentAwareSplitter(contentType);
		const refinedChunks = await contentSplitter.splitDocuments([chunk]);
		for (const refinedChunk of refinedChunks) {
			refinedChunk.metadata = refinedChunk.metadata || {};
			refinedChunk.metadata.contentType = contentType;
		}
		finalChunks.push(...refinedChunks);
	}
	return finalChunks;
}

/**
 * Chunks and enriches a single MDX doc with metadata.
 * - Parses and removes frontmatter
 * - Chunks markdown (by heading, content type, etc.)
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
			currentHeading = chunk.pageContent
				.split('\n')[0]
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
