/**
 * Database Agent
 *
 * Queries a PostgreSQL database using Drizzle ORM with type-safe queries.
 * Uses the same 6 chair products from the vector demo, stored in a relational table.
 *
 * Key concepts:
 * - createPostgresDrizzle() connects using DATABASE_URL by default
 * - Schema defined in TypeScript with full autocompletion
 * - Composable queries: filters, aggregates, keyword search
 *
 * Docs: https://agentuity.dev/services/database
 */
import { createPostgresDrizzle, sql, lt, gte, ilike } from '@agentuity/drizzle';
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { products } from './schema';
import sampleProducts from '../vector/sample-products.json';

interface DatabaseSummaryRow {
	avgPrice: number;
	minPrice: number;
	maxPrice: number;
	total: number;
}

const agent = createAgent('database', {
	description: 'Query a PostgreSQL database with type-safe Drizzle ORM',

	schema: {
		input: s.object({
			query: s.string(),
			seedData: s.optional(s.boolean()),
		}),
		output: s.object({
			rows: s.array(s.unknown()),
			query: s.string(),
			count: s.number(),
		}),
	},

	handler: async (ctx, { query, seedData }) => {
		const { db, close } = createPostgresDrizzle({
			schema: { products },
			driver: 'pg',
		});

		try {
			// Seed data if requested: create table + upsert all products
			if (seedData) {
				ctx.logger.info('Seeding database');

				await db.execute(sql`
					CREATE TABLE IF NOT EXISTS products (
						id SERIAL PRIMARY KEY,
						sku TEXT NOT NULL UNIQUE,
						name TEXT NOT NULL,
						price REAL NOT NULL,
						avg_rating REAL NOT NULL,
						description TEXT NOT NULL,
						customer_feedback TEXT NOT NULL
					)
				`);

				for (const product of sampleProducts) {
					await db.execute(sql`
						INSERT INTO products (sku, name, price, avg_rating, description, customer_feedback)
						VALUES (${product.sku}, ${product.name}, ${product.price}, ${product.avg_rating}, ${product.description}, ${product.customer_feedback})
						ON CONFLICT (sku) DO UPDATE SET
							name = EXCLUDED.name,
							price = EXCLUDED.price,
							avg_rating = EXCLUDED.avg_rating,
							description = EXCLUDED.description,
							customer_feedback = EXCLUDED.customer_feedback
					`);
				}

				ctx.logger.info('Seeded products', { count: sampleProducts.length });
			}

			// Execute the query based on input
			let rows: unknown[];

			switch (query) {
				case 'budget':
					ctx.logger.info('Querying budget products (< $200)');
					rows = await db.select().from(products).where(lt(products.price, 200));
					break;

				case 'top-rated':
					ctx.logger.info('Querying top-rated products (4.5+)');
					rows = await db.select().from(products).where(gte(products.avg_rating, 4.5));
					break;

				case 'keyword':
					ctx.logger.info('Searching for "Ergo" keyword');
					rows = await db.select().from(products).where(ilike(products.name, '%Ergo%'));
					break;

				case 'summary': {
					ctx.logger.info('Computing price summary');
					rows = (await db
						.select({
							avgPrice: sql<number>`ROUND(AVG(${products.price})::numeric, 2)`.mapWith(
								Number
							),
							minPrice: sql<number>`MIN(${products.price})`.mapWith(Number),
							maxPrice: sql<number>`MAX(${products.price})`.mapWith(Number),
							total: sql<number>`COUNT(*)::int`.mapWith(Number),
						})
						.from(products)) satisfies DatabaseSummaryRow[];
					break;
				}

				default:
					ctx.logger.info('Querying all products');
					rows = await db.select().from(products);
					break;
			}

			ctx.logger.info('Query complete', { query, count: rows.length });

			return { rows, query, count: rows.length };
		} finally {
			await close();
		}
	},
});

export default agent;
