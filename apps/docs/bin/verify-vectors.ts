#!/usr/bin/env bun
/**
 * verify-vectors.ts
 *
 * Checks which MDX doc files have vectors in the agentuity-docs vector store.
 * Uses the Agentuity CLI to query vector search with metadata path filtering.
 *
 * Usage: bun apps/docs/bin/verify-vectors.ts
 */

import { $ } from 'bun';
import { join } from 'path';
import { readdir, stat } from 'fs/promises';

const VECTOR_STORE = 'agentuity-docs';
const REGION = 'use';
// The deployed docs app runs under the Agentuity, Inc. org - vector stores are project-scoped
const ORG_ID = 'org_2u8RgDTwcZWrZrZ3sZh24T5FCtz';
const PROJECT_ID = 'proj_5ed7da797bef771d65e1bd6946a052b1';
const CONTENT_DIR = join(import.meta.dir, '../src/web/content');

/**
 * Recursively collect all .mdx file paths relative to the content directory.
 */
async function collectMdxFiles(dir: string, base: string = ''): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const relativePath = base ? `${base}/${entry.name}` : entry.name;
		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			files.push(...(await collectMdxFiles(fullPath, relativePath)));
		} else if (entry.name.endsWith('.mdx')) {
			files.push(relativePath);
		}
	}

	return files.sort();
}

/**
 * Check if vectors exist for a given path in the vector store.
 * Returns the count of vectors found, or -1 on error.
 */
async function checkVectorExists(path: string): Promise<{ count: number; error?: string }> {
	try {
		const result =
			await $`agentuity cloud vector search ${VECTOR_STORE} "content" --region ${REGION} --limit 1 --metadata ${'path=' + path} --org-id ${ORG_ID} --project-id ${PROJECT_ID} --json`
				.quiet()
				.text();

		// Strip control characters that break JSON parsing
		const cleaned = result.replace(/[\x00-\x09\x0b-\x1f]/g, '');

		try {
			const parsed = JSON.parse(cleaned);
			if (Array.isArray(parsed)) {
				return { count: parsed.length };
			}
			// Some CLI versions wrap in an object
			if (parsed.data && Array.isArray(parsed.data)) {
				return { count: parsed.data.length };
			}
			if (parsed.results && Array.isArray(parsed.results)) {
				return { count: parsed.results.length };
			}
			// If we got JSON but can't find an array, check if it's empty
			return { count: 0, error: `Unexpected JSON shape: ${Object.keys(parsed).join(', ')}` };
		} catch (parseErr) {
			// If JSON parsing fails even after cleaning, try to detect if results exist
			// by looking for "key" field in the output
			if (cleaned.includes('"key"')) {
				return { count: 1 };
			}
			return { count: 0, error: `JSON parse error: ${String(parseErr).slice(0, 100)}` };
		}
	} catch (err) {
		return { count: -1, error: String(err).slice(0, 200) };
	}
}

async function main() {
	console.log('Collecting MDX files from', CONTENT_DIR);
	const files = await collectMdxFiles(CONTENT_DIR);
	console.log(`Found ${files.length} MDX files\n`);

	const found: string[] = [];
	const missing: string[] = [];
	const errors: Array<{ path: string; error: string }> = [];

	// Process files with some concurrency (but not too much to avoid rate limits)
	const CONCURRENCY = 5;
	let completed = 0;

	for (let i = 0; i < files.length; i += CONCURRENCY) {
		const batch = files.slice(i, i + CONCURRENCY);
		const results = await Promise.all(
			batch.map(async (file) => {
				const result = await checkVectorExists(file);
				completed++;
				const status =
					result.count > 0 ? '  EXISTS' : result.count === 0 ? ' MISSING' : '   ERROR';
				process.stderr.write(`[${completed}/${files.length}] ${status} ${file}\n`);
				return { file, ...result };
			})
		);

		for (const { file, count, error } of results) {
			if (count > 0) {
				found.push(file);
			} else if (count === 0) {
				missing.push(file);
			} else {
				errors.push({ path: file, error: error || 'Unknown error' });
			}
		}
	}

	// Print summary
	console.log('\n' + '='.repeat(60));
	console.log('VERIFICATION RESULTS');
	console.log('='.repeat(60));
	console.log(`Total files:  ${files.length}`);
	console.log(`Found:        ${found.length}`);
	console.log(`Missing:      ${missing.length}`);
	console.log(`Errors:       ${errors.length}`);

	if (missing.length > 0) {
		console.log('\n--- MISSING FILES ---');
		// Group by top-level directory
		const groups: Record<string, string[]> = {};
		for (const file of missing) {
			const dir = file.split('/')[0];
			if (!groups[dir]) groups[dir] = [];
			groups[dir].push(file);
		}
		for (const [dir, dirFiles] of Object.entries(groups).sort()) {
			console.log(`\n  ${dir}/ (${dirFiles.length} files)`);
			for (const f of dirFiles) {
				console.log(`    - ${f}`);
			}
		}
	}

	if (found.length > 0) {
		console.log('\n--- FOUND FILES ---');
		const groups: Record<string, string[]> = {};
		for (const file of found) {
			const dir = file.split('/')[0];
			if (!groups[dir]) groups[dir] = [];
			groups[dir].push(file);
		}
		for (const [dir, dirFiles] of Object.entries(groups).sort()) {
			console.log(`\n  ${dir}/ (${dirFiles.length} files)`);
			for (const f of dirFiles) {
				console.log(`    - ${f}`);
			}
		}
	}

	if (errors.length > 0) {
		console.log('\n--- ERRORS ---');
		for (const { path, error } of errors) {
			console.log(`  ${path}: ${error}`);
		}
	}

	// Output JSON summary for programmatic use
	const summary = { total: files.length, found: found.length, missing: missing.length, errors: errors.length, missingFiles: missing, foundFiles: found, errorDetails: errors };
	console.log('\n--- JSON SUMMARY ---');
	console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
