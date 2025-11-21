import { z } from 'zod';
import { createCommand } from '../../types';
import { createRepl, type ReplCommand } from '../../repl';
import { showBanner } from '../../banner';
import * as tui from '../../tui';
import { isPossiblyJSON, tryParseJSON } from '../../json';
import { createStorageAdapter } from './util';

export const replSubcommand = createCommand({
	name: 'repl',
	description: 'Start an interactive repl for working with keyvalue database',
	requires: { auth: true, project: true },

	async handler(ctx) {
		showBanner(undefined, true);
		tui.info('Managing keyvalue store for project');
		tui.newline();
		console.log(tui.bold('Org:'.padEnd(10, ' ')), ' ', tui.muted(ctx.project.orgId));
		console.log(tui.bold('Project:'.padEnd(10, ' ')), ' ', tui.muted(ctx.project.projectId));
		tui.newline();

		const storage = await createStorageAdapter(ctx);

		const commands: ReplCommand[] = [
			{
				name: 'set',
				aliases: ['put'],
				description: 'Set a value for a namespace',
				schema: {
					args: z.tuple([
						z.string().min(1),
						z.string().min(1),
						z.string().min(1),
						z.coerce.number().min(60).optional(),
					]),
					argNames: ['namespace', 'key', 'value', 'ttl'],
				},
				handler: async (ctx) => {
					ctx.setProgress('saving');
					const started = Date.now();
					const contentType = isPossiblyJSON(ctx.parsed.args[2]!)
						? 'application/json'
						: 'text/plain';
					const ttl = ctx.parsed.args.length > 3 ? parseInt(ctx.parsed.args[3]!) : undefined;
					await storage.set(ctx.parsed.args[0]!, ctx.parsed.args[1]!, ctx.parsed.args[2]!, {
						contentType,
						ttl,
					});
					ctx.success(`saved in ${(Date.now() - started).toFixed(1)}ms (${contentType})`);
				},
			},
			{
				name: 'get',
				description: 'Get a value for a namespace and key',
				schema: {
					args: z.tuple([z.string().min(1), z.string().min(1)]),
					argNames: ['namespace', 'key'],
				},
				handler: async (ctx) => {
					ctx.setProgress('fetching');
					const started = Date.now();
					const res = await storage.get(ctx.parsed.args[0]!, ctx.parsed.args[1]!);
					if (res.exists) {
						if (res.data) {
							if (res.contentType?.includes('json')) {
								const val = tryParseJSON(res.data as unknown as string);
								ctx.json(val);
							} else if (res.contentType?.includes('text')) {
								ctx.write(String(res.data));
							} else {
								const b = res.data as ArrayBuffer;
								ctx.info(`Read ${b.byteLength} bytes (${res.contentType})`);
							}
							ctx.success(
								`retrieved in ${(Date.now() - started).toFixed(1)}ms (${res.contentType})`
							);
						} else {
							ctx.warning(
								`${ctx.parsed.args[1]!} returned empty data for ${ctx.parsed.args[0]!}`
							);
						}
					} else {
						ctx.warning(`${ctx.parsed.args[1]!} does not exist in ${ctx.parsed.args[0]!}`);
					}
				},
			},
			{
				name: 'delete',
				aliases: ['rm', 'remove', 'del'],
				description: 'Delete a value for a namespace and key',
				schema: {
					args: z.tuple([z.string().min(1), z.string().min(1)]),
					argNames: ['namespace', 'key'],
				},
				handler: async (ctx) => {
					ctx.setProgress('deleting');
					const started = Date.now();
					await storage.delete(ctx.parsed.args[0]!, ctx.parsed.args[1]!);
					ctx.success(`deleted in ${(Date.now() - started).toFixed(1)}ms`);
				},
			},
			{
				name: 'stats',
				description: 'Get statistics for a namespace or all namespaces',
				schema: {
					args: z.tuple([z.string().min(1).optional()]),
					argNames: ['namespace'],
				},
				handler: async (ctx) => {
					ctx.setProgress('fetching stats');
					const started = Date.now();
					if (ctx.parsed.args.length > 0 && ctx.parsed.args[0]) {
						const stats = await storage.getStats(ctx.parsed.args[0]!);
						ctx.info(`Statistics for ${tui.bold(ctx.parsed.args[0]!)}:`);
						ctx.write(`  Keys: ${stats.count}`);
						const sizeMB = (stats.sum / (1024 * 1024)).toFixed(2);
						ctx.write(`  Total size: ${sizeMB} MB`);
						if (stats.createdAt) {
							ctx.write(`  Created: ${new Date(stats.createdAt).toLocaleString()}`);
						}
						if (stats.lastUsedAt) {
							ctx.write(`  Last used: ${new Date(stats.lastUsedAt).toLocaleString()}`);
						}
					} else {
						const allStats = await storage.getAllStats();
						const entries = Object.entries(allStats);
						if (entries.length === 0) {
							ctx.info('No namespaces found');
						} else {
							ctx.info(`Found ${entries.length} namespace(s):`);
							for (const [name, stats] of entries) {
								const sizeMB = (stats.sum / (1024 * 1024)).toFixed(2);
								ctx.write(`  ${tui.bold(name)}: ${stats.count} keys, ${sizeMB} MB`);
							}
						}
					}
					ctx.success(`retrieved in ${(Date.now() - started).toFixed(1)}ms`);
				},
			},
			{
				name: 'search',
				description: 'Search for keys matching a keyword',
				schema: {
					args: z.tuple([z.string().min(1), z.string().min(1)]),
					argNames: ['namespace', 'keyword'],
				},
				handler: async (ctx) => {
					ctx.setProgress('searching');
					const started = Date.now();
					const results = await storage.search(ctx.parsed.args[0]!, ctx.parsed.args[1]!);
					const keys = Object.keys(results);
					if (keys.length === 0) {
						ctx.info(
							`No keys found matching ${tui.bold(ctx.parsed.args[1]!)} in ${tui.bold(ctx.parsed.args[0]!)}`
						);
					} else {
						ctx.info(
							`Found ${keys.length} key(s) matching ${tui.bold(ctx.parsed.args[1]!)}:`
						);
						for (const key of keys) {
							const item = results[key];
							if (!item) continue;
							const sizeMB = (item.size / (1024 * 1024)).toFixed(2);
							const date = new Date(item.updated_at).toLocaleString();
							ctx.write(
								`  ${tui.bold(key)}: ${sizeMB} MB, ${item.contentType}, updated ${date}`
							);
						}
					}
					ctx.success(`retrieved in ${(Date.now() - started).toFixed(1)}ms`);
				},
			},
			{
				name: 'keys',
				aliases: ['ls', 'list'],
				description: 'List all keys in a namespace',
				schema: {
					args: z.tuple([z.string().min(1)]),
					argNames: ['namespace'],
				},
				handler: async (ctx) => {
					ctx.setProgress('listing keys');
					const started = Date.now();
					const keys = await storage.getKeys(ctx.parsed.args[0]!);
					if (keys.length === 0) {
						ctx.info(`No keys found in namespace ${tui.bold(ctx.parsed.args[0]!)}`);
					} else {
						ctx.info(`Found ${keys.length} key(s) in ${tui.bold(ctx.parsed.args[0]!)}:`);
						for (const key of keys) {
							ctx.write(`  ${key}`);
						}
					}
					ctx.success(`retrieved in ${(Date.now() - started).toFixed(1)}ms`);
				},
			},
			{
				name: 'namespaces',
				aliases: ['ns', 'list-namespaces'],
				description: 'List all namespaces',
				handler: async (ctx) => {
					ctx.setProgress('listing namespaces');
					const started = Date.now();
					const namespaces = await storage.getNamespaces();
					if (namespaces.length === 0) {
						ctx.info('No namespaces found');
					} else {
						ctx.info(`Found ${namespaces.length} namespace(s):`);
						for (const name of namespaces) {
							ctx.write(`  ${name}`);
						}
					}
					ctx.success(`retrieved in ${(Date.now() - started).toFixed(1)}ms`);
				},
			},
			{
				name: 'create-namespace',
				aliases: ['create', 'mkns'],
				description: 'Create a new namespace',
				schema: {
					args: z.tuple([z.string().min(1)]),
					argNames: ['namespace'],
				},
				handler: async (ctx) => {
					ctx.setProgress('creating namespace');
					const started = Date.now();
					await storage.createNamespace(ctx.parsed.args[0]!);
					ctx.success(`created in ${(Date.now() - started).toFixed(1)}ms`);
				},
			},
			{
				name: 'delete-namespace',
				aliases: ['rmns', 'delns'],
				description: 'Delete a namespace and all its keys',
				schema: {
					args: z.tuple([z.string().min(1)]),
					argNames: ['namespace'],
				},
				handler: async (ctx) => {
					ctx.warning(
						`This will delete namespace ${tui.bold(ctx.parsed.args[0]!)} and ALL its keys.`
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
					ctx.setProgress('deleting namespace');
					const started = Date.now();
					await storage.deleteNamespace(ctx.parsed.args[0]!);
					ctx.success(`deleted in ${(Date.now() - started).toFixed(1)}ms`);
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
			name: 'keyvalue',
			prompt: '> ',
			welcome: tui.muted('Type "help" or / for available commands.'),
			exitMessage: 'Goodbye!',
			commands,
		});
	},
});

export default replSubcommand;
