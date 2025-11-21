import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { tryParseJSON } from '../../json';
import { createStorageAdapter } from './util';

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get an object from the object storage',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			bucket: z.string().min(1).describe('the bucket name'),
			key: z.string().min(1).describe('the key name'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const storage = await createStorageAdapter(ctx);
		const started = Date.now();
		const res = await storage.get(args.bucket, args.key);
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
				tui.success(`retrieved in ${(Date.now() - started).toFixed(1)}ms (${res.contentType})`);
			} else {
				tui.warning(`${args.key} returned empty data for bucket ${args.bucket}`);
			}
		} else {
			tui.warning(`${args.key} does not exist in bucket ${args.bucket}`);
		}
	},
});

export default getSubcommand;
