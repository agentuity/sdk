import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { isPossiblyJSON } from '../../json';
import { createStorageAdapter } from './util';
import { getCommand } from '../../command-prefix';

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
	requires: { auth: true, project: true },
	examples: [
		`${getCommand('kv set production user:123 \'{"name":"Alice","email":"alice@example.com"}\'')} - Store user data`,
		`${getCommand('kv set cache session:abc "session-data-here" --ttl 3600')} - Store session with 1h TTL`,
		`${getCommand('kv set staging cache:homepage "<!DOCTYPE html>..." --ttl 600')} - Cache homepage for 10m`,
	],
	schema: {
		args: z.object({
			namespace: z.string().min(1).max(64).describe('the namespace name'),
			key: z.string().min(1).max(64).describe('the key name'),
			value: z.string().min(1).describe('the value'),
			ttl: z.coerce.number().min(60).optional().describe('the optional expiration in seconds'),
		}),
		response: KVSetResponseSchema,
	},

	async handler(ctx) {
		const { args } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const contentType = isPossiblyJSON(args.value) ? 'application/json' : 'text/plain';
		const ttl = args.ttl;
		await storage.set(args.namespace, args.key, args.value, {
			contentType,
			ttl,
		});
		const durationMs = Date.now() - started;
		tui.success(`saved in ${durationMs.toFixed(1)}ms (${contentType})`);

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
