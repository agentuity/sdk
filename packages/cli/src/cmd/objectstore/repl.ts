import { z } from 'zod';
import { createCommand } from '../../types';
import { createRepl, type ReplCommand } from '../../repl';
import { showBanner } from '../../banner';
import * as tui from '../../tui';
import { isPossiblyJSON, tryParseJSON } from '../../json';
import { createStorageAdapter } from './util';

export const replSubcommand = createCommand({
	name: 'repl',
	description: 'Start an interactive repl for working with object storage',
	requires: { auth: true, project: true },

	async handler(ctx) {
		showBanner(undefined, true);
		tui.info('Managing object store for project');
		tui.newline();
		console.log(tui.bold('Org:'.padEnd(10, ' ')), ' ', tui.muted(ctx.project.orgId));
		console.log(tui.bold('Project:'.padEnd(10, ' ')), ' ', tui.muted(ctx.project.projectId));
		tui.newline();

		const storage = await createStorageAdapter(ctx);

		const commands: ReplCommand[] = [
			{
				name: 'put',
				description: 'Put an object into a bucket',
				schema: {
					args: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
					argNames: ['bucket', 'key', 'value'],
				},
				handler: async (ctx) => {
					ctx.setProgress('saving');
					const started = Date.now();
					const contentType = isPossiblyJSON(ctx.parsed.args[2]!)
						? 'application/json'
						: 'text/plain';
					const data = new TextEncoder().encode(ctx.parsed.args[2]!);
					await storage.put(ctx.parsed.args[0]!, ctx.parsed.args[1]!, data, {
						contentType,
					});
					ctx.success(`saved in ${(Date.now() - started).toFixed(1)}ms (${contentType})`);
				},
			},
			{
				name: 'get',
				description: 'Get an object from a bucket',
				schema: {
					args: z.tuple([z.string().min(1), z.string().min(1)]),
					argNames: ['bucket', 'key'],
				},
				handler: async (ctx) => {
					ctx.setProgress('fetching');
					const started = Date.now();
					const res = await storage.get(ctx.parsed.args[0]!, ctx.parsed.args[1]!);
					if (res.exists) {
						if (res.data) {
							if (res.contentType?.includes('json')) {
								const val = tryParseJSON(new TextDecoder().decode(res.data));
								ctx.json(val);
							} else if (res.contentType?.includes('text')) {
								ctx.write(new TextDecoder().decode(res.data));
							} else {
								ctx.info(`Read ${res.data.byteLength} bytes (${res.contentType})`);
							}
							ctx.success(
								`retrieved in ${(Date.now() - started).toFixed(1)}ms (${res.contentType})`
							);
						} else {
							ctx.warning(
								`${ctx.parsed.args[1]!} returned empty data for bucket ${ctx.parsed.args[0]!}`
							);
						}
					} else {
						ctx.warning(
							`${ctx.parsed.args[1]!} does not exist in bucket ${ctx.parsed.args[0]!}`
						);
					}
				},
			},
			{
				name: 'delete',
				aliases: ['rm', 'remove', 'del'],
				description: 'Delete an object from a bucket',
				schema: {
					args: z.tuple([z.string().min(1), z.string().min(1)]),
					argNames: ['bucket', 'key'],
				},
				handler: async (ctx) => {
					ctx.setProgress('deleting');
					const started = Date.now();
					const deleted = await storage.delete(ctx.parsed.args[0]!, ctx.parsed.args[1]!);
					if (deleted) {
						ctx.success(`deleted in ${(Date.now() - started).toFixed(1)}ms`);
					} else {
						ctx.warning(
							`${ctx.parsed.args[1]!} did not exist in bucket ${ctx.parsed.args[0]!}`
						);
					}
				},
			},
			{
				name: 'url',
				aliases: ['publicurl', 'presigned'],
				description: 'Create a public URL for an object',
				schema: {
					args: z.tuple([
						z.string().min(1),
						z.string().min(1),
						z.coerce.number().min(60).optional(),
					]),
					argNames: ['bucket', 'key', 'expires'],
				},
				handler: async (ctx) => {
					ctx.setProgress('creating url');
					const started = Date.now();
					const expires =
						ctx.parsed.args.length > 2 ? parseInt(ctx.parsed.args[2]!) : undefined;
					const url = await storage.createPublicURL(
						ctx.parsed.args[0]!,
						ctx.parsed.args[1]!,
						expires ? { expiresDuration: expires } : undefined
					);
					ctx.write(url);
					ctx.success(`created in ${(Date.now() - started).toFixed(1)}ms`);
				},
			},
			{
				name: 'list-buckets',
				aliases: ['buckets', 'lb'],
				description: 'List all buckets',
				handler: async (ctx) => {
					ctx.setProgress('listing buckets');
					const started = Date.now();
					const buckets = await storage.listBuckets();
					if (buckets.length === 0) {
						ctx.info('No buckets found');
					} else {
						ctx.info(`Found ${buckets.length} bucket(s):`);
						for (const bucket of buckets) {
							const sizeMB = (bucket.total_bytes / (1024 * 1024)).toFixed(2);
							ctx.write(
								`  ${tui.bold(bucket.name)}: ${bucket.object_count} objects, ${sizeMB} MB`
							);
						}
					}
					ctx.success(`retrieved in ${(Date.now() - started).toFixed(1)}ms`);
				},
			},
			{
				name: 'list-keys',
				aliases: ['keys', 'ls'],
				description: 'List all keys in a bucket',
				schema: {
					args: z.tuple([z.string().min(1)]),
					argNames: ['bucket'],
				},
				handler: async (ctx) => {
					ctx.setProgress('listing keys');
					const started = Date.now();
					const objects = await storage.listKeys(ctx.parsed.args[0]!);
					if (objects.length === 0) {
						ctx.info(`No objects found in bucket ${tui.bold(ctx.parsed.args[0]!)}`);
					} else {
						ctx.info(
							`Found ${objects.length} object(s) in ${tui.bold(ctx.parsed.args[0]!)}:`
						);
						for (const obj of objects) {
							const sizeMB = (obj.size / (1024 * 1024)).toFixed(2);
							const date = new Date(obj.updated_at).toLocaleString();
							ctx.write(`  ${tui.bold(obj.key)}: ${sizeMB} MB, updated ${date}`);
						}
					}
					ctx.success(`retrieved in ${(Date.now() - started).toFixed(1)}ms`);
				},
			},
			{
				name: 'delete-bucket',
				aliases: ['rmbucket', 'delbucket'],
				description: 'Delete a bucket and all its contents',
				schema: {
					args: z.tuple([z.string().min(1)]),
					argNames: ['bucket'],
				},
				handler: async (ctx) => {
					ctx.warning(
						`This will delete bucket ${tui.bold(ctx.parsed.args[0]!)} and ALL its contents.`
					);
					const confirm = await new Promise<boolean>((resolve) => {
						process.stdout.write('Are you sure? (yes/no): ');
						process.stdin.once('data', (data) => {
							const answer = data.toString().trim().toLowerCase();
							resolve(answer === 'yes' || answer === 'y');
						});
					});
					if (!confirm) {
						ctx.info('Cancelled');
						return;
					}
					ctx.setProgress('deleting bucket');
					const started = Date.now();
					const deleted = await storage.deleteBucket(ctx.parsed.args[0]!);
					if (deleted) {
						ctx.success(`deleted in ${(Date.now() - started).toFixed(1)}ms`);
					} else {
						ctx.warning(`Bucket ${tui.bold(ctx.parsed.args[0]!)} not found`);
					}
				},
			},
			{
				name: 'exit',
				aliases: ['quit'],
				description: 'Exit the repl',
				handler: async (ctx) => {
					return ctx.exit();
				},
			},
		];

		// Start the REPL
		await createRepl({
			name: 'objectstore',
			prompt: '> ',
			welcome: tui.muted('Type "help" or / for available commands.'),
			exitMessage: 'Goodbye!',
			commands,
		});
	},
});

export default replSubcommand;
