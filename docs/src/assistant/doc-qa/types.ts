import { s } from '@agentuity/schema';
import type { Logger } from '@agentuity/hono';
import type { VectorSearchParams, VectorSearchResult } from '@agentuity/vector';

export interface DocsAssistantContext {
	readonly logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	readonly vector: {
		search(
			name: string,
			params: VectorSearchParams<DocsChunkMetadata>
		): Promise<VectorSearchResult<DocsChunkMetadata>[]>;
	};
}

export interface DocsChunkMetadata extends Record<string, unknown> {
	readonly path?: string;
	readonly title?: string;
	readonly text?: string;
	readonly chunkIndex?: number;
	readonly totalChunks?: number;
	readonly contentType?: string;
	readonly heading?: string;
	readonly description?: string;
	readonly createdAt?: string;
}

export const RelevantDocSchema = s.object({
	path: s.string(),
	title: s.string(),
	content: s.string(),
	relevanceScore: s.optional(s.number()),
	chunkRange: s.optional(s.string()),
	chunkIndex: s.optional(s.number()),
});

export const DocumentReferenceSchema = s.object({
	url: s.string(),
	title: s.string(),
});

export const AnswerSchema = s.object({
	answer: s.string(),
	documents: s.array(DocumentReferenceSchema),
});

export const PromptTypeSchema = s.enum(['Normal', 'Thinking']);

export const PromptClassificationSchema = s.object({
	type: PromptTypeSchema,
	confidence: s.number(),
	reasoning: s.string(),
});

// Generated TypeScript types
export type RelevantDoc = {
	path: string;
	title: string;
	content: string;
	relevanceScore?: number;
	chunkRange?: string;
	chunkIndex?: number;
};

export type DocumentReference = {
	url: string;
	title: string;
};

export type Answer = {
	answer: string;
	documents: DocumentReference[];
};

export type PromptType = 'Normal' | 'Thinking';

export type PromptClassification = {
	type: PromptType;
	confidence: number;
	reasoning: string;
};
