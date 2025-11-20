import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { tryParseJSON } from '../../json';
import { createStorageAdapter } from './util';

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get a value from the keyvalue storage',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			namespace: z.string().min(1),
			key: z.string().min(1),
		}),
	},

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
	},
});

export default getSubcommand;
