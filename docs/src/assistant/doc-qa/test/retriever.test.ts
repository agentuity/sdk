import { expect, test } from 'bun:test';
import type { VectorSearchParams, VectorSearchResult } from '@agentuity/vector';
import { retrieveRelevantDocs } from '../retriever';
import type { DocsAssistantContext, DocsChunkMetadata } from '../types';

const DOC_PATH = 'get-started/quickstart.mdx';

function makeChunk(chunkIndex: number, text: string): VectorSearchResult<DocsChunkMetadata> {
	return {
		id: `chunk-${chunkIndex}`,
		key: `${DOC_PATH}:${chunkIndex}`,
		metadata: {
			path: DOC_PATH,
			title: 'Quickstart',
			text,
			chunkIndex,
		},
		similarity: 0.9,
	};
}

test('retrieves adjacent chunks for a matched docs result', async () => {
	const chunks = new Map<number, VectorSearchResult<DocsChunkMetadata>>([
		[0, makeChunk(0, 'Create an app.')],
		[1, makeChunk(1, 'Run the local dev server.')],
		[2, makeChunk(2, 'Deploy when the app is ready.')],
	]);
	const searchCalls: VectorSearchParams<DocsChunkMetadata>[] = [];

	const ctx: DocsAssistantContext = {
		logger: {
			debug: () => undefined,
			error: () => undefined,
			info: () => undefined,
			warn: () => undefined,
		},
		vector: {
			async search(
				_name: string,
				params: VectorSearchParams<DocsChunkMetadata>
			): Promise<VectorSearchResult<DocsChunkMetadata>[]> {
				searchCalls.push(params);
				const requestedIndex = params.metadata?.chunkIndex;
				if (typeof requestedIndex === 'number') {
					const chunk = chunks.get(requestedIndex);
					return chunk ? [chunk] : [];
				}
				return [makeChunk(1, 'Run the local dev server.')];
			},
		},
	};

	const docs = await retrieveRelevantDocs(ctx, 'quickstart');

	expect(docs).toHaveLength(1);
	const [doc] = docs;
	if (!doc) {
		throw new Error('Expected one expanded document');
	}

	expect(doc.path).toBe(DOC_PATH);
	expect(doc.title).toBe('Quickstart');
	expect(doc.content).toBe(
		'Create an app.\n\nRun the local dev server.\n\nDeploy when the app is ready.'
	);
	expect(searchCalls.some((params) => params.metadata?.chunkIndex === 0)).toBe(true);
	expect(searchCalls.some((params) => params.metadata?.chunkIndex === 2)).toBe(true);
});
