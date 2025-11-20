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
					const contentType = isPossiblyJSON(ctx.parsed.args[2])
						? 'application/json'
						: 'text/plain';
					const ttl = ctx.parsed.args.length > 3 ? parseInt(ctx.parsed.args[3]) : undefined;
					await storage.set(ctx.parsed.args[0], ctx.parsed.args[1], ctx.parsed.args[2], {
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
					const res = await storage.get(ctx.parsed.args[0], ctx.parsed.args[1]);
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
								`${ctx.parsed.args[1]} returned empty data for ${ctx.parsed.args[0]}`
							);
						}
					} else {
						ctx.warning(`${ctx.parsed.args[1]} does not exist in ${ctx.parsed.args[0]}`);
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
					await storage.delete(ctx.parsed.args[0], ctx.parsed.args[1]);
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
