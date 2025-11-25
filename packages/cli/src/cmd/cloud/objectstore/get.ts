import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { tryParseJSON } from '../../../json';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

const ObjectGetResponseSchema = z.object({
	exists: z.boolean().describe('Whether the object exists'),
	data: z.any().optional().describe('Object data (binary)'),
	contentType: z.string().optional().describe('Content type'),
});

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get an object from the object storage',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, project: true },
	examples: [
		`${getCommand('objectstore get uploads images/logo.png')} - Download logo image`,
		`${getCommand('objectstore get assets data/export.json')} - Get JSON export`,
		`${getCommand('objectstore get backups db-2024.sql')} - Get database backup`,
	],
	schema: {
		args: z.object({
			bucket: z.string().min(1).describe('the bucket name'),
			key: z.string().min(1).describe('the key name'),
		}),
		response: ObjectGetResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const storage = await createStorageAdapter(ctx);
		const started = Date.now();
		const res = await storage.get(args.bucket, args.key);

		if (!options.json) {
			if (res.exists) {
				if (res.data) {
					if (res.contentType?.includes('json')) {
						const val = tryParseJSON(new TextDecoder().decode(res.data));
						tui.json(val);
					} else if (res.contentType?.includes('text')) {
						console.log(new TextDecoder().decode(res.data));
					} else {
						tui.info(`Read ${res.data.byteLength} bytes (${res.contentType})`);
					}
					tui.success(
						`retrieved in ${(Date.now() - started).toFixed(1)}ms (${res.contentType})`
					);
				} else {
					tui.warning(`${args.key} returned empty data for bucket ${args.bucket}`);
				}
			} else {
				tui.warning(`${args.key} does not exist in bucket ${args.bucket}`);
			}
		}

		return {
			exists: res.exists,
			data: res.data,
			contentType: res.exists ? res.contentType : undefined,
		};
	},
});

export default getSubcommand;
