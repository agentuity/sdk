/**
 * Standalone run script for Vector Search demo
 *
 * Shows the direct service flow: upsert text documents, fetch them, search by
 * meaning, inspect namespace state, then clean up.
 *
 * Usage: bun run src/run/vector.ts '{"query":"comfortable chair"}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxOutput } from '../lib/sandbox-output-writer';

const input = JSON.parse(process.argv[2] ?? '{}');
const query = input.query ?? 'comfortable chair';
const ctx = getDemoContext();

const runId = Date.now().toString(36);
const namespace = `explorer-sandbox-${runId}`;
const output: string[] = [];
let inserted = false;

const chair = {
	sku: `${runId}:chair-001`,
	name: 'ErgoMax Pro Chair',
	price: 549,
};
const desk = {
	sku: `${runId}:desk-001`,
	name: 'LiftDesk Air',
	price: 799,
};

try {
	// Document text is embedded by the service so later searches can match by meaning.
	await ctx.vector.upsert(
		namespace,
		{
			key: chair.sku,
			document: `${chair.name}: Premium ergonomic office chair with lumbar support`,
			metadata: chair,
		},
		{
			key: desk.sku,
			document: `${desk.name}: Adjustable standing desk for focused work`,
			metadata: desk,
		}
	);
	inserted = true;

	const loadedChair = await ctx.vector.get<typeof chair>(namespace, chair.sku);
	const loadedDocuments = await ctx.vector.getMany(namespace, chair.sku, desk.sku);

	const results = await ctx.vector.search(namespace, {
		query,
		limit: 3,
		similarity: 0.3,
	});
	const exists = await ctx.vector.exists(namespace);
	const stats = await ctx.vector.getStats(namespace);
	const namespaces = await ctx.vector.getNamespaces();

	for (const result of results) {
		ctx.logger.info('Match found', {
			name: result.metadata?.name,
			price: result.metadata?.price,
			similarity: result.similarity.toFixed(2),
		});
	}

	const deleted = await ctx.vector.delete(namespace, chair.sku, desk.sku);
	ctx.logger.info('Cleaned up vector documents', { deleted });

	output.push(`Namespace: "${namespace}"`);
	output.push(`Upserted: "${chair.name}" (${chair.sku})`);
	output.push(`Upserted: "${desk.name}" (${desk.sku})`);
	output.push(`Get chair: ${loadedChair.exists ? 'found' : 'not found'}`);
	output.push(`Get many: ${loadedDocuments.size}`);
	output.push(`Searched: "${query}"`);
	output.push(`Found: ${results.length} match(es)`);
	output.push(
		...results.map((r) => `  - "${r.metadata?.name}" - ${Math.round(r.similarity * 100)}%`)
	);
	output.push(`Exists before cleanup: ${exists ? 'yes' : 'no'}`);
	output.push(`Stats count: ${stats.count}`);
	output.push(`Namespace listed: ${namespaces.includes(namespace) ? 'yes' : 'no'}`);
	output.push(`Deleted documents: ${deleted}`);
} catch (error) {
	output.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
} finally {
	if (inserted) {
		try {
			await ctx.vector.deleteNamespace(namespace);
			ctx.logger.info('Deleted vector namespace', { namespace });
			output.push(`Deleted namespace: "${namespace}"`);
		} catch (error) {
			ctx.logger.warn('Failed to delete vector namespace during cleanup', {
				error: error instanceof Error ? error.message : String(error),
				namespace,
			});
			output.push(`Cleanup failed: "${namespace}"`);
			process.exitCode = 1;
		}
	}

	writeSandboxOutput(output.join('\n'));
}
