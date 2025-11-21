import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { isPossiblyJSON } from '../../json';
import { createStorageAdapter } from './util';
import { getCommand } from '../../command-prefix';

const ObjectStorePutResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	bucket: z.string().describe('Bucket name'),
	key: z.string().describe('Object key'),
	size: z.number().describe('Size in bytes'),
	contentType: z.string().describe('Content type'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const putSubcommand = createCommand({
	name: 'put',
	description: 'Put an object into the object storage',
	tags: ['mutating', 'creates-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, project: true },
	examples: [
		`${getCommand('objectstore put uploads images/logo.png @./logo.png')} - Upload logo from file`,
		`${getCommand('objectstore put assets data/config.json \'{"api":"https://api.example.com"}\'')} - Store JSON config`,
		`${getCommand('objectstore put backups db-2024.sql @~/Downloads/backup.sql --content-type application/sql')} - Upload SQL backup`,
	],
	schema: {
		args: z.object({
			bucket: z.string().min(1).max(64).describe('the bucket name'),
			key: z.string().min(1).max(64).describe('the key name'),
			value: z.string().min(1).describe('the value'),
			contentType: z.string().optional().describe('an optional content type'),
		}),
		response: ObjectStorePutResponseSchema,
	},

	async handler(ctx) {
		const { args } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const contentType =
			args.contentType ?? (isPossiblyJSON(args.value) ? 'application/json' : 'text/plain');
		const data = new TextEncoder().encode(args.value);
		await storage.put(args.bucket, args.key, data, {
			contentType,
		});
		const durationMs = Date.now() - started;
		tui.success(`saved in ${durationMs.toFixed(1)}ms (${contentType})`);

		return {
			success: true,
			bucket: args.bucket,
			key: args.key,
			size: data.length,
			contentType,
			durationMs,
		};
	},
});

export default putSubcommand;
