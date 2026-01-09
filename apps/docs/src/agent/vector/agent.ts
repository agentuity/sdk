/**
 * Vector Search Agent
 *
 * Semantic search using vector embeddings - find content by meaning, not exact keywords.
 * Unlike KV storage where you need the exact key, Vector lets you search with natural
 * language queries like "comfortable office chair" and find "ergonomic seating".
 *
 * How it works: Text is converted to numbers (embeddings) that capture meaning.
 * Similar concepts end up close together in vector space, enabling similarity search.
 *
 * Operations shown:
 * - ctx.vector.exists(namespace) - Check if namespace has data
 * - ctx.vector.upsert(namespace, { key, document, metadata }) - Store with auto-embedding
 * - ctx.vector.search(namespace, { query, limit, similarity }) - Semantic search
 *
 * Also available: get(), getMany(), delete() for direct key access.
 *
 * Docs: https://preview.agentuity.dev/v1/Build/Storage/vector
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import sampleProducts from './sample-products.json';

// Metadata type for vector storage - must extend Record<string, unknown> for SDK compatibility
interface ProductMetadata extends Record<string, unknown> {
	sku: string;
	name: string;
	price: number;
	avg_rating: number;
	description: string;
	customer_feedback: string;
}

const namespace = 'sdk-explorer';
const SIMILARITY_THRESHOLD = 0.3; // Minimum similarity score (0-1) for search results
const SEARCH_LIMIT = 3; // Maximum number of results to return

const agent = createAgent('vector', {
	description: 'Semantic product search with AI recommendations',
	schema: {
		input: s.object({
			query: s.string(),
			seedData: s.optional(s.boolean()),
		}),
		output: s.object({
			matches: s.array(
				s.object({
					sku: s.string(),
					name: s.string(),
					price: s.number(),
					rating: s.number(),
					similarity: s.number(),
				})
			),
			recommendation: s.string(),
			recommendedSKU: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		const { query, seedData } = input;

		// Optionally seed sample products (one-time only)
		if (seedData) {
			// Check if namespace already has data
			const exists = await ctx.vector.exists(namespace);
			if (!exists) {
				ctx.logger.info('Seeding sample products into vector store');
				for (const product of sampleProducts) {
					// Upsert with document text - embeddings are auto-generated
					await ctx.vector.upsert(namespace, {
						key: product.sku,
						document: `${product.name}: ${product.description} ${product.customer_feedback}`,
						metadata: product,
					});
				}
			} else {
				ctx.logger.info('Sample products already seeded, skipping');
			}
		}

		// Semantic search - returns results sorted by similarity
		const results = await ctx.vector.search<ProductMetadata>(namespace, {
			query,
			limit: SEARCH_LIMIT,
			similarity: SIMILARITY_THRESHOLD,
		});

		if (results.length === 0) {
			return {
				matches: [],
				recommendation:
					'No matching products found. Try seeding sample data first, or search for chairs/office furniture.',
				recommendedSKU: '',
			};
		}

		// Filter results to only those with metadata, then map to output format
		const resultsWithMetadata = results.filter(
			(r): r is typeof r & { metadata: ProductMetadata } => r.metadata != null
		);

		const matches = resultsWithMetadata.map((r) => ({
			sku: r.metadata.sku,
			name: r.metadata.name,
			price: r.metadata.price,
			rating: r.metadata.avg_rating,
			similarity: r.similarity,
		}));

		// Build context for AI recommendation
		const context = resultsWithMetadata
			.map(
				(r) =>
					`${r.metadata.name}: SKU ${r.metadata.sku}, $${r.metadata.price}, ${r.metadata.avg_rating} stars. "${r.metadata.customer_feedback}"`
			)
			.join('\n');

		// Generate AI recommendation based on search results
		const RecommendationSchema = z.object({
			summary: z.string(),
			recommendedSKU: z.string(),
		});

		const { object: recommendation } = await generateObject({
			model: openai('gpt-5-mini'),
			system:
				'You are a furniture consultant. Provide a brief 2-3 sentence recommendation based on the search results. Reference customer feedback when relevant.',
			prompt: `Customer searched for: "${query}"\n\nMatching products:\n${context}`,
			schema: RecommendationSchema,
		});

		return {
			matches,
			recommendation: recommendation?.summary ?? '',
			recommendedSKU: recommendation?.recommendedSKU ?? '',
		};
	},
});

export default agent;
