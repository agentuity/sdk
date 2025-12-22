import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
import type { VectorUpsertParams } from '@agentuity/core';

const VectorUpsertResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	namespace: z.string().describe('Namespace name'),
	count: z.number().describe('Number of vectors upserted'),
	results: z
		.array(
			z.object({
				key: z.string().describe('Vector key'),
				id: z.string().describe('Vector ID'),
			})
		)
		.describe('Upsert results with key-to-id mappings'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const upsertSubcommand = createCommand({
	name: 'upsert',
	aliases: ['put', 'add'],
	description: 'Add or update vectors in the vector storage',
	tags: ['mutating', 'updates-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, project: true },
	examples: [
		{
			command: getCommand('vector upsert products doc1 --document "Comfortable office chair"'),
			description: 'Upsert a single vector with document text',
		},
		{
			command: getCommand(
				'vector upsert products doc1 --document "Chair" --metadata \'{"category":"furniture"}\''
			),
			description: 'Upsert with metadata',
		},
		{
			command: getCommand('vector upsert embeddings vec1 --embeddings "[0.1, 0.2, 0.3]"'),
			description: 'Upsert with pre-computed embeddings',
		},
		{
			command: getCommand('vector upsert products --file vectors.json'),
			description: 'Bulk upsert from JSON file',
		},
		{
			command: `cat vectors.json | ${getCommand('vector upsert products -')}`,
			description: 'Bulk upsert from stdin',
		},
	],
	schema: {
		args: z.object({
			namespace: z.string().min(1).describe('the vector storage namespace'),
			key: z
				.string()
				.optional()
				.describe('the key for single vector upsert (not used with --file or stdin)'),
		}),
		options: z.object({
			document: z.string().optional().describe('document text to embed'),
			embeddings: z.string().optional().describe('pre-computed embeddings as JSON array'),
			metadata: z.string().optional().describe('metadata as JSON object'),
			file: z
				.string()
				.optional()
				.describe('path to JSON file containing vectors, or "-" for stdin'),
		}),
		response: VectorUpsertResponseSchema,
	},
	webUrl: (ctx) => `/services/vector/${encodeURIComponent(ctx.args.namespace)}`,

	async handler(ctx) {
		const { args, opts, options, logger } = ctx;
		const storage = await createStorageAdapter(ctx);

		let documents: VectorUpsertParams[] = [];

		// Check if reading from file or stdin
		const fileArg = opts.file || (args.key === '-' ? '-' : undefined);

		if (fileArg) {
			let content: string;

			if (fileArg === '-') {
				// Read from stdin
				const chunks: Uint8Array[] = [];
				const reader = Bun.stdin.stream().getReader();

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					chunks.push(value);
				}

				const decoder = new TextDecoder();
				content = chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('');
			} else {
				// Read from file
				const file = Bun.file(fileArg);
				if (!(await file.exists())) {
					tui.fatal(`File not found: ${fileArg}`);
				}
				content = await file.text();
			}

			try {
				const parsed = JSON.parse(content.trim());
				if (Array.isArray(parsed)) {
					documents = parsed as VectorUpsertParams[];
				} else {
					documents = [parsed as VectorUpsertParams];
				}
			} catch {
				tui.fatal('Invalid JSON in input file/stdin');
			}

			// Validate documents
			for (const doc of documents) {
				if (!doc.key || typeof doc.key !== 'string') {
					tui.fatal('Each document must have a non-empty "key" property');
				}
				if (!doc.document && !('embeddings' in doc)) {
					tui.fatal(
						`Document with key "${doc.key}" must have either "document" or "embeddings" property`
					);
				}
			}
		} else {
			// Single vector upsert via command line arguments
			if (!args.key) {
				tui.fatal('Key is required for single vector upsert. Use --file for bulk upsert.');
			}

			if (!opts.document && !opts.embeddings) {
				tui.fatal('Either --document or --embeddings is required');
			}

			if (opts.document && opts.embeddings) {
				tui.fatal('Cannot use both --document and --embeddings');
			}

			let metadata: Record<string, unknown> | undefined;
			if (opts.metadata) {
				try {
					metadata = JSON.parse(opts.metadata);
				} catch {
					tui.fatal('Invalid JSON in --metadata');
				}
			}

			if (opts.document) {
				documents = [
					{
						key: args.key,
						document: opts.document,
						metadata,
					},
				];
			} else if (opts.embeddings) {
				let embeddings: number[];
				try {
					embeddings = JSON.parse(opts.embeddings);
					if (!Array.isArray(embeddings) || !embeddings.every((n) => typeof n === 'number')) {
						throw new Error('Not an array of numbers');
					}
				} catch {
					tui.fatal('Invalid embeddings: must be a JSON array of numbers');
				}

				documents = [
					{
						key: args.key,
						embeddings,
						metadata,
					},
				];
			}
		}

		if (documents.length === 0) {
			tui.fatal('No documents to upsert');
		}

		const started = Date.now();

		logger.debug(`Upserting ${documents.length} vector(s) to ${args.namespace}`);

		const results = await storage.upsert(args.namespace, ...documents);
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(
				`Upserted ${results.length} vector(s) to ${tui.bold(args.namespace)} (${durationMs}ms)`
			);

			if (results.length <= 10) {
				for (const result of results) {
					tui.arrow(`${result.key} → ${result.id}`);
				}
			}
		}

		return {
			success: true,
			namespace: args.namespace,
			count: results.length,
			results,
			durationMs,
		};
	},
});

export default upsertSubcommand;
