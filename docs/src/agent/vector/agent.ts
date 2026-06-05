/**
 * Vector Search Explorer demo
 *
 * Semantic search using vector embeddings - find content by meaning, not exact keywords.
 * Unlike KV storage where you need the exact key, Vector lets you search with natural
 * language queries like "comfortable office chair" and find "ergonomic seating".
 *
 * How it works: Text is converted to numbers (embeddings) that capture meaning.
 * Similar concepts end up close together in vector space, enabling similarity search.
 *
 * Operations shown:
 * - ctx.vector.upsert(namespace, { key, document, metadata }) - Store with auto-embedding (idempotent)
 * - ctx.vector.search(namespace, { query, limit, similarity }) - Semantic search
 *
 * Also available: get(), getMany(), delete() for direct key access.
 *
 * Docs: https://agentuity.dev/services/storage/vector
 */
import { defineDemoAgent } from '../demo-agent';
import { s } from '@agentuity/schema';
import { AIGatewayClient } from '@agentuity/aigateway';
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
const RECOMMENDATION_MODEL = 'openai/gpt-5.4-mini';

const RecommendationSchema = z.object({
	summary: z.string(),
	recommendedSKU: z.string(),
});

const RecommendationJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['summary', 'recommendedSKU'],
	properties: {
		summary: {
			type: 'string',
			description: 'A concise 2-3 sentence recommendation.',
		},
		recommendedSKU: {
			type: 'string',
			description: 'The SKU of the best matching product.',
		},
	},
};

const agent = defineDemoAgent('vector', {
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

		// Seed sample products when requested (upsert is idempotent - safe to run multiple times)
		if (seedData) {
			for (const product of sampleProducts) {
				// Upsert with document text - embeddings are auto-generated
				await ctx.vector.upsert(namespace, {
					key: product.sku,
					document: `${product.name}: ${product.description} ${product.customer_feedback}`,
					metadata: product,
				});
			}
			ctx.logger.info('Sample products seeded into vector store');
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

		const gateway = new AIGatewayClient();
		const result = await gateway.completeStructured({
			model: RECOMMENDATION_MODEL,
			messages: [
				{
					role: 'system',
					content:
						'You are a furniture consultant. Provide a brief 2-3 sentence recommendation based on the search results. Reference customer feedback when relevant.',
				},
				{
					role: 'user',
					content: `Customer searched for: "${query}"\n\nMatching products:\n${context}`,
				},
			],
			response_schema: RecommendationJsonSchema,
		});
		const recommendation = RecommendationSchema.safeParse(result.data);
		if (!recommendation.success) {
			throw new Error('AI Gateway returned an invalid recommendation shape.');
		}

		return {
			matches,
			recommendation: recommendation.data.summary,
			recommendedSKU: recommendation.data.recommendedSKU,
		};
	},
});

export default agent;
