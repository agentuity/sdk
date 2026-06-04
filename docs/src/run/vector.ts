/**
 * Standalone run script for Vector Search demo
 *
 * Shows the direct service flow: upsert text, search by meaning, then delete
 * the demo document. Unique keys keep concurrent Explorer runs isolated.
 *
 * Usage: bun run src/run/vector.ts '{"query":"comfortable chair"}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';

const input = JSON.parse(process.argv[2] ?? '{}');
const query = input.query ?? 'comfortable chair';
const ctx = getDemoContext();

const runId = Date.now().toString(36);
const namespace = 'explorer-sandbox';

const product = {
	sku: `${runId}:chair-001`,
	name: 'ErgoMax Pro Chair',
	price: 549,
};

try {
	// Document text is embedded by the service so later searches can match by meaning.
	await ctx.vector.upsert(namespace, {
		key: product.sku,
		document: `${product.name}: Premium ergonomic office chair with lumbar support`,
		metadata: product,
	});

	const results = await ctx.vector.search(namespace, {
		query,
		limit: 3,
		similarity: 0.3,
	});

	for (const result of results) {
		ctx.logger.info('Match found', {
			name: result.metadata?.name,
			price: result.metadata?.price,
			similarity: result.similarity.toFixed(2),
		});
	}

	await ctx.vector.delete(namespace, product.sku);
	ctx.logger.info('Cleaned up', { sku: product.sku });

	writeSandboxOutput(
		[
			`Upserted: "${product.name}" (${product.sku})`,
			`Searched: "${query}"`,
			`Found: ${results.length} match(es)`,
			...results.map(
				(r) =>
					`  - "${r.metadata?.name}" ($${r.metadata?.price}) - ${Math.round(r.similarity * 100)}%`
			),
		].join('\n')
	);
} catch (error) {
	writeSandboxError(error);
	process.exitCode = 1;
}
