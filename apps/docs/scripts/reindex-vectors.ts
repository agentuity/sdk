/**
 * Re-index all MDX docs into the vector store.
 *
 * Reads every .mdx file under src/web/content/, base64-encodes it,
 * and POSTs batches to the local /api/process-docs endpoint.
 *
 * Requirements:
 *   - Dev server running (`bun run dev`)
 *   - AGENT_BEARER_TOKEN env var set
 *   - OPENAI_API_KEY configured on the server (for embeddings)
 *
 * Usage:
 *   AGENT_BEARER_TOKEN=<token> bun run reindex
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const CONTENT_DIR = join(import.meta.dir, '../src/web/content');
const BASE_URL = process.env.REINDEX_URL ?? 'http://localhost:3500';
const ENDPOINT = `${BASE_URL}/api/process-docs-sync`;
const BATCH_SIZE = 10;
const TOKEN = process.env.AGENT_BEARER_TOKEN;

if (!TOKEN) {
	console.error('Error: AGENT_BEARER_TOKEN env var is required');
	process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────

async function getAllMdxFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	async function scan(currentDir: string) {
		const entries = await readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await scan(fullPath);
			} else if (entry.name.endsWith('.mdx')) {
				files.push(fullPath);
			}
		}
	}
	await scan(dir);
	return files.sort();
}

interface ChangedFile {
	path: string;
	content: string; // base64
}

async function buildChangedEntry(fullPath: string): Promise<ChangedFile> {
	const raw = await readFile(fullPath);
	const relPath = relative(CONTENT_DIR, fullPath); // e.g. agents/creating-agents.mdx
	return {
		path: relPath,
		content: raw.toString('base64'),
	};
}

async function sendBatch(
	changed: ChangedFile[],
	batchNum: number,
	totalBatches: number
): Promise<{ ok: boolean; stats?: any; error?: string }> {
	const payload = {
		repo: 'agentuity/sdk',
		commit: 'manual-reindex',
		changed,
		removed: [],
	};

	console.log(
		`[${batchNum}/${totalBatches}] Sending ${changed.length} files: ${changed.map((f) => f.path).join(', ')}`
	);

	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${TOKEN}`,
		},
		body: JSON.stringify(payload),
	});

	const body = await res.json();

	if (!res.ok) {
		return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(body)}` };
	}

	return { ok: true, stats: body.stats ?? body };
}

// ── main ─────────────────────────────────────────────────────────────

async function main() {
	console.log(`Scanning ${CONTENT_DIR} for .mdx files...`);
	const mdxFiles = await getAllMdxFiles(CONTENT_DIR);
	console.log(`Found ${mdxFiles.length} MDX files\n`);

	// Build all entries up front (fast, just file reads + base64)
	const entries = await Promise.all(mdxFiles.map(buildChangedEntry));

	// Split into batches
	const batches: ChangedFile[][] = [];
	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		batches.push(entries.slice(i, i + BATCH_SIZE));
	}

	let totalProcessed = 0;
	let totalErrors = 0;
	const errorFiles: string[] = [];

	for (let i = 0; i < batches.length; i++) {
		const result = await sendBatch(batches[i], i + 1, batches.length);

		if (!result.ok) {
			console.error(`  ERROR: ${result.error}`);
			totalErrors += batches[i].length;
			errorFiles.push(...batches[i].map((f) => f.path));
			continue;
		}

		const stats = result.stats;
		totalProcessed += stats?.processed ?? 0;
		totalErrors += stats?.errors ?? 0;
		if (stats?.errorFiles?.length) {
			errorFiles.push(...stats.errorFiles);
		}

		console.log(`  OK: ${stats?.processed ?? '?'} processed, ${stats?.errors ?? 0} errors`);
	}

	console.log('\n── Summary ──');
	console.log(`Total files: ${mdxFiles.length}`);
	console.log(`Processed:   ${totalProcessed}`);
	console.log(`Errors:      ${totalErrors}`);
	if (errorFiles.length > 0) {
		console.log(`Error files:  ${errorFiles.join(', ')}`);
	}

	if (totalErrors > 0) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
