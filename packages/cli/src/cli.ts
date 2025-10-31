import { Command } from 'commander';
import type { CommandDefinition, SubcommandDefinition, CommandContext } from './types';
import { showBanner } from './banner';
import { requireAuth, optionalAuth } from './auth';
import { parseArgsSchema, parseOptionsSchema, buildValidationInput } from './schema-parser';

export async function createCLI(version: string): Promise<Command> {
	const program = new Command();

	program
		.name('agentuity')
		.description('Agentuity CLI')
		.version(version, '-V, --version', 'Display version')
		.helpOption('-h, --help', 'Display help');

	program
		.option('--config <path>', 'Config file path', '~/.config/agentuity/production.yaml')
		.option('--log-level <level>', 'Log level', process.env.AGENTUITY_LOG_LEVEL ?? 'info')
		.option('--log-timestamp', 'Show timestamps in log output', false)
		.option('--no-log-prefix', 'Hide log level prefixes', false)
		.option('--color-scheme <scheme>', 'Color scheme: light or dark');

	const skipVersionCheckOption = program.createOption(
		'--skip-version-check',
		'Skip version compatibility check (dev only)'
	);
	skipVersionCheckOption.hideHelp();
	program.addOption(skipVersionCheckOption);

	program.action(() => {
		showBanner(version);
		program.help();
	});

	return program;
}

async function registerSubcommand(
	parent: Command,
	subcommand: SubcommandDefinition,
	baseCtx: CommandContext,
	hidden?: boolean
): Promise<void> {
	const cmd = parent.command(subcommand.name, { hidden }).description(subcommand.description);

	if (subcommand.aliases) {
		cmd.aliases(subcommand.aliases);
	}

	// Auto-generate arguments and options from schemas
	if (subcommand.schema?.args) {
		const parsed = parseArgsSchema(subcommand.schema.args);
		for (const argMeta of parsed.metadata) {
			let argSyntax: string;
			if (argMeta.variadic) {
				argSyntax = argMeta.optional ? `[${argMeta.name}...]` : `<${argMeta.name}...>`;
			} else {
				argSyntax = argMeta.optional ? `[${argMeta.name}]` : `<${argMeta.name}>`;
			}
			cmd.argument(argSyntax);
		}
	}

	if (subcommand.schema?.options) {
		const parsed = parseOptionsSchema(subcommand.schema.options);
		for (const opt of parsed) {
			const flag = opt.name.replace(/([A-Z])/g, '-$1').toLowerCase();
			const desc = opt.description || '';
			if (opt.type === 'boolean') {
				// Support negatable boolean options (--no-flag) when they have a default
				if (opt.hasDefault) {
					cmd.option(`--no-${flag}`, desc);
				}
				cmd.option(`--${flag}`, desc);
			} else if (opt.type === 'number') {
				cmd.option(`--${flag} <${opt.name}>`, desc, parseFloat);
			} else {
				cmd.option(`--${flag} <${opt.name}>`, desc);
			}
		}
	}

	cmd.action(async (...rawArgs: unknown[]) => {
		const cmdObj = rawArgs[rawArgs.length - 1] as { opts: () => Record<string, unknown> };
		const options = cmdObj.opts();
		const args = rawArgs.slice(0, -1);

		if (subcommand.requiresAuth) {
			const auth = await requireAuth(baseCtx as CommandContext<false>);

			if (subcommand.schema) {
				try {
					const input = buildValidationInput(subcommand.schema, args, options);
					const ctx: Record<string, unknown> = {
						...baseCtx,
						auth,
					};
					if (subcommand.schema.args) {
						ctx.args = subcommand.schema.args.parse(input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = subcommand.schema.options.parse(input.options);
					}
					await subcommand.handler(ctx as CommandContext);
				} catch (error) {
					if (error && typeof error === 'object' && 'issues' in error) {
						baseCtx.logger.error('Validation error:');
						const issues = (error as { issues: Array<{ path: string[]; message: string }> })
							.issues;
						for (const issue of issues) {
							baseCtx.logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
						}
						process.exit(1);
					}
					throw error;
				}
			} else {
				const ctx: CommandContext<true> = {
					...baseCtx,
					auth,
				};
				await subcommand.handler(ctx);
			}
		} else if (subcommand.optionalAuth) {
			const continueText =
				typeof subcommand.optionalAuth === 'string' ? subcommand.optionalAuth : undefined;
			const auth = await optionalAuth(baseCtx as CommandContext<false>, continueText);

			if (subcommand.schema) {
				try {
					const input = buildValidationInput(subcommand.schema, args, options);
					const ctx: Record<string, unknown> = {
						...baseCtx,
						auth,
					};
					if (subcommand.schema.args) {
						ctx.args = subcommand.schema.args.parse(input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = subcommand.schema.options.parse(input.options);
					}
					await subcommand.handler(ctx as CommandContext);
				} catch (error) {
					if (error && typeof error === 'object' && 'issues' in error) {
						baseCtx.logger.error('Validation error:');
						const issues = (error as { issues: Array<{ path: string[]; message: string }> })
							.issues;
						for (const issue of issues) {
							baseCtx.logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
						}
						process.exit(1);
					}
					throw error;
				}
			} else {
				const ctx = { ...baseCtx, auth };
				await subcommand.handler(ctx as CommandContext);
			}
		} else {
			if (subcommand.schema) {
				try {
					const input = buildValidationInput(subcommand.schema, args, options);
					const ctx: Record<string, unknown> = {
						...baseCtx,
					};
					if (subcommand.schema.args) {
						ctx.args = subcommand.schema.args.parse(input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = subcommand.schema.options.parse(input.options);
					}
					await subcommand.handler(ctx as CommandContext);
				} catch (error) {
					if (error && typeof error === 'object' && 'issues' in error) {
						baseCtx.logger.error('Validation error:');
						const issues = (error as { issues: Array<{ path: string[]; message: string }> })
							.issues;
						for (const issue of issues) {
							baseCtx.logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
						}
						process.exit(1);
					}
					throw error;
				}
			} else {
				await subcommand.handler(baseCtx as CommandContext<false>);
			}
		}
	});
}

export async function registerCommands(
	program: Command,
	commands: CommandDefinition[],
	baseCtx: CommandContext
): Promise<void> {
	for (const cmdDef of commands) {
		if (cmdDef.subcommands) {
			const cmd = program
				.command(cmdDef.name, { hidden: cmdDef.hidden })
				.description(cmdDef.description);

			if (cmdDef.aliases) {
				cmd.aliases(cmdDef.aliases);
			}

			if (cmdDef.handler) {
				cmd.action(async () => {
					if (cmdDef.requiresAuth) {
						const auth = await requireAuth(baseCtx as CommandContext<false>);
						const ctx: CommandContext<true> = { ...baseCtx, auth };
						await cmdDef.handler!(ctx);
					} else if (cmdDef.optionalAuth) {
						const continueText =
							typeof cmdDef.optionalAuth === 'string' ? cmdDef.optionalAuth : undefined;
						const auth = await optionalAuth(baseCtx as CommandContext<false>, continueText);
						const ctx = { ...baseCtx, auth };
						await cmdDef.handler!(ctx as CommandContext);
					} else {
						await cmdDef.handler!(baseCtx as CommandContext<false>);
					}
				});
			} else {
				cmd.action(() => cmd.help());
			}

			for (const sub of cmdDef.subcommands) {
				await registerSubcommand(cmd, sub, baseCtx);
			}
		} else {
			await registerSubcommand(
				program,
				cmdDef as unknown as SubcommandDefinition,
				baseCtx,
				cmdDef.hidden
			);
		}
	}
}
