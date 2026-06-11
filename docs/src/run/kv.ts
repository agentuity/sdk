/**
 * Standalone run script for KV Storage demo
 *
 * Shows the direct service flow: create an isolated namespace, write records,
 * read/list/search/stat them, then delete the namespace.
 *
 * Usage: bun run src/run/kv.ts '{}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxOutput } from '../lib/sandbox-output-writer';

const ctx = getDemoContext();

const runId = Date.now().toString(36);
const namespace = `explorer-sandbox-${runId}`;
const key = `${runId}:session-001`;
const summaryKey = `${runId}:session-001:summary`;
const output: string[] = [];
let namespaceCreated = false;

const sessionData = {
	visitorId: 'visitor-abc123',
	lastActive: new Date().toISOString(),
	preferences: { theme: 'dark' },
};

try {
	ctx.logger.info('Creating namespace', { namespace });
	await ctx.kv.createNamespace(namespace, { defaultTTLSeconds: 300 });
	namespaceCreated = true;

	ctx.logger.info('Setting key');

	// TTL keeps demo data from lingering if cleanup fails.
	await ctx.kv.set(namespace, key, sessionData, { ttl: 300 });
	await ctx.kv.set(
		namespace,
		summaryKey,
		{
			visitorId: sessionData.visitorId,
			theme: sessionData.preferences.theme,
		},
		{ ttl: 300 }
	);

	ctx.logger.info('Getting key');

	const result = await ctx.kv.get<typeof sessionData>(namespace, key);
	const keys = await ctx.kv.getKeys(namespace);
	const matches = await ctx.kv.search(namespace, 'session');
	const stats = await ctx.kv.getStats(namespace);
	const namespaces = await ctx.kv.getNamespaces();

	output.push(`Namespace: "${namespace}"`);
	output.push(`Set: "${key}"`);
	output.push(`Set: "${summaryKey}"`);
	output.push(`Get: ${result.exists ? 'found' : 'not found'}`);
	output.push(`Keys: ${keys.length}`);
	output.push(`Search matches: ${matches.size}`);
	output.push(`Stats count: ${stats.count}`);
	output.push(`Namespace listed: ${namespaces.includes(namespace) ? 'yes' : 'no'}`);
} catch (error) {
	output.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
} finally {
	if (namespaceCreated) {
		try {
			await ctx.kv.deleteNamespace(namespace);
			ctx.logger.info('Deleted namespace', { namespace });
			output.push(`Deleted namespace: "${namespace}"`);
		} catch (error) {
			ctx.logger.warn('Failed to delete KV namespace during cleanup', {
				error: error instanceof Error ? error.message : String(error),
				namespace,
			});
			output.push(`Cleanup failed: "${namespace}"`);
			process.exitCode = 1;
		}
	}

	writeSandboxOutput(
		[
			...output,
			`  visitorId: "${sessionData.visitorId}"`,
			`  theme: "${sessionData.preferences.theme}"`,
		].join('\n')
	);
}
