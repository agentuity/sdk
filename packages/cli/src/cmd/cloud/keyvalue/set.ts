import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { isPossiblyJSON } from '../../../json.ts';
import { createStorageAdapter } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
const KVSetResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	namespace: z.string().describe('Namespace name'),
	key: z.string().describe('Key name'),
	contentType: z.string().describe('Content type (application/json or text/plain)'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
	ttl: z.number().optional().describe('TTL in seconds if set'),
});

export const setSubcommand = createCommand({
	name: 'set',
	aliases: ['put'],
	description: 'Set a key and value in the keyvalue storage',
	tags: ['mutating', 'updates-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, region: true },
	optional: { project: true },
	examples: [
		{
			command: getCommand(
				'cloud kv set production user:123 \'{"name":"Alice","email":"alice@example.com"}\''
			),
			description: 'Store user data',
		},
		{
			command: getCommand('cloud kv set cache session:abc "session-data-here" --ttl 3600'),
			description: 'Store session with 1h TTL',
		},
		{
			command: getCommand('cloud kv set staging cache:homepage "<!DOCTYPE html>..." --ttl 600'),
			description: 'Cache homepage for 10m',
		},
	],
	schema: {
		args: z.object({
			namespace: z.string().min(1).max(64).describe('the namespace name'),
			key: z.string().min(1).max(64).describe('the key name'),
			value: z.string().min(1).describe('the value'),
		}),
		options: z.object({
			ttl: z.coerce
				.number()
				.refine((val) => val >= 0, {
					message: 'TTL must be a non-negative number of seconds',
				})
				.optional()
				.describe('TTL in seconds (0 for no expiration, values 1-59 clamped to 60 by server)'),
		}),
		response: KVSetResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const contentType = isPossiblyJSON(args.value) ? 'application/json' : 'text/plain';
		const ttl = opts?.ttl;
		await storage.set(args.namespace, args.key, args.value, {
			contentType,
			ttl,
		});
		const durationMs = Date.now() - started;
		if (!options.json) {
			tui.success(`saved in ${durationMs.toFixed(1)}ms (${contentType})`);
		}

		return {
			success: true,
			namespace: args.namespace,
			key: args.key,
			contentType,
			durationMs,
			ttl,
		};
	},
});

export default setSubcommand;
