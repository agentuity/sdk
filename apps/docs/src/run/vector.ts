/**
 * Standalone run script for Vector Search demo
 *
 * NOTE: Intentionally separate from src/agent/vector/agent.ts.
 * Uses "explorer-sandbox" namespace with cleanup (delete) operations.
 * See src/run/README.md for architecture details.
 *
 * Shows direct SDK calls: upsert → search → cleanup
 * Uses unique keys per run for isolation
 *
 * Usage: bun run src/run/vector.ts '{"query":"comfortable chair"}'
 */
import { createAgentContext } from "@agentuity/runtime";

const input = JSON.parse(process.argv[2] ?? '{}');
const query = input.query ?? "comfortable chair";
const ctx = createAgentContext();

// Unique key prefix for this run (isolation)
const runId = Date.now().toString(36);
const namespace = "explorer-sandbox";

// Sample product to upsert
const product = {
	sku: `${runId}:chair-001`,
	name: "ErgoMax Pro Chair",
	price: 549,
};

// UPSERT: document text is auto-embedded
await ctx.vector.upsert(namespace, {
	key: product.sku,
	document: `${product.name}: Premium ergonomic office chair with lumbar support`,
	metadata: product,
});

// SEARCH: finds by meaning ("comfortable" matches "ergonomic")
const results = await ctx.vector.search(namespace, {
	query,
	limit: 3,
	similarity: 0.3,
});

// Results include similarity scores and metadata
for (const result of results) {
	ctx.logger.info("Match found", {
		name: result.metadata?.name,
		price: result.metadata?.price,
		similarity: result.similarity.toFixed(2),
	});
}

// CLEANUP: delete the unique key
await ctx.vector.delete(namespace, product.sku);
ctx.logger.info("Cleaned up", { sku: product.sku });

console.log("---OUTPUT---");
console.log(`Upserted: "${product.name}" (${product.sku})`);
console.log(`Searched: "${query}"`);
console.log(`Found: ${results.length} match(es)`);
for (const r of results) {
	console.log(`  - "${r.metadata?.name}" ($${r.metadata?.price}) - ${Math.round(r.similarity * 100)}%`);
}
