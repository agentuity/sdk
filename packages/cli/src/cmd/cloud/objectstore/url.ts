import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
const ObjectStoreURLResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	bucket: z.string().describe('Bucket name'),
	key: z.string().describe('Object key'),
	url: z.string().describe('Public or presigned URL'),
	expires: z.number().optional().describe('URL expiration time in seconds'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const urlSubcommand = createCommand({
	name: 'url',
	aliases: ['publicurl', 'presigned'],
	description: 'Create a public URL for an object',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('objectstore url uploads images/logo.png'),
			description: 'Get public URL for logo',
		},
		{
			command: getCommand('objectstore url assets data/export.json --expires 3600'),
			description: 'Get 1h temporary URL',
		},
		{
			command: getCommand('objectstore presigned backups db-2024.sql --expires 300'),
			description: 'Get 5m presigned URL',
		},
	],
	schema: {
		args: z.object({
			bucket: z.string().min(1).describe('the bucket name'),
			key: z.string().min(1).describe('the key name'),
			expires: z.coerce.number().min(60).optional().describe('the expiration in seconds'),
		}),
		response: ObjectStoreURLResponseSchema,
	},

	async handler(ctx) {
		const { args } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const url = await storage.createPublicURL(args.bucket, args.key, {
			expiresDuration: args.expires,
		});
		const durationMs = Date.now() - started;
		console.log(url);
		tui.success(`created in ${durationMs.toFixed(1)}ms`);

		return {
			success: true,
			bucket: args.bucket,
			key: args.key,
			url,
			expires: args.expires,
			durationMs,
		};
	},
});

export default urlSubcommand;
