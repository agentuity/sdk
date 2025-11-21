import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { tryParseJSON } from '../../json';
import { createStorageAdapter } from './util';
import { getCommand } from '../../command-prefix';

const KVGetResponseSchema = z.object({
	exists: z.boolean().describe('Whether the key exists'),
	data: z.union([z.string(), z.any()]).optional().describe('Value data (string or binary)'),
	contentType: z.string().optional().describe('Content type'),
});

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get a value from the keyvalue storage',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, project: true },
	examples: [
		`${getCommand('kv get production user:123')} - Get user data`,
		`${getCommand('kv get cache session:abc')} - Get cached session`,
		`${getCommand('kv get staging cache:homepage')} - Get homepage cache`,
	],
	schema: {
		args: z.object({
			namespace: z.string().min(1).describe('the namespace name'),
			key: z.string().min(1).describe('the key name'),
		}),
		response: KVGetResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args } = ctx;
		const storage = await createStorageAdapter(ctx);
		const started = Date.now();
		const res = await storage.get(args.namespace, args.key);
		if (res.exists) {
			if (res.data) {
				if (res.contentType?.includes('json')) {
					const val = tryParseJSON(res.data as unknown as string);
					tui.json(val);
				} else if (res.contentType?.includes('text')) {
					console.log(String(res.data));
				} else {
					const b = res.data as ArrayBuffer;
					tui.info(`Read ${b.byteLength} bytes (${res.contentType})`);
				}
				tui.success(`retrieved in ${(Date.now() - started).toFixed(1)}ms (${res.contentType})`);
			} else {
				tui.warning(`${args.key} returned empty data for ${args.namespace}`);
			}
		} else {
			tui.warning(`${args.key} does not exist in ${args.namespace}`);
		}

		return {
			exists: res.exists,
			data: res.data,
			contentType: res.exists ? res.contentType : undefined,
		};
	},
});

export default getSubcommand;
