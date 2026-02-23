import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
/**
 * Generates embeddings for an array of texts using the OpenAI embedding API (via Vercel AI SDK).
 * @param texts Array of strings to embed.
 * @param model Embedding model to use (default: 'text-embedding-3-small').
 * @returns Promise<number[][]> Array of embedding vectors.
 */
export async function embedChunks(
	texts: string[],
	model = 'text-embedding-3-small'
): Promise<number[][]> {
	if (!Array.isArray(texts) || texts.length === 0) {
		throw new Error('No texts provided for embedding.');
	}
	if (texts.some((t) => typeof t !== 'string' || t.trim() === '')) {
		throw new Error(
			'All items passed to embedChunks must be non-empty strings.'
		);
	}
	let response: Awaited<ReturnType<typeof embedMany>>;
	try {
		response = await embedMany({
			model: openai.embedding(model),
			values: texts,
		});
	} catch (err) {
		throw new Error(`Failed to embed ${texts.length} chunk(s): ${String(err)}`);
	}

	if (!response.embeddings || response.embeddings.length !== texts.length) {
		throw new Error('Embedding API returned unexpected result.');
	}

	return response.embeddings;
}
