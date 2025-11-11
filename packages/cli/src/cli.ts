import { Command } from 'commander';
import type {
	CommandDefinition,
	SubcommandDefinition,
	CommandContext,
	ProjectConfig,
	Config,
	Requires,
	Optional,
	Logger,
} from './types';
import { showBanner } from './banner';
import { requireAuth, optionalAuth } from './auth';
import { parseArgsSchema, parseOptionsSchema, buildValidationInput } from './schema-parser';
import { defaultProfileName, loadProjectConfig } from './config';
import { APIClient, getAPIBaseURL } from './api';

function createAPIClient(baseCtx: CommandContext, config: Config | null): APIClient {
	try {
		const apiUrl = getAPIBaseURL(config);
		const apiClient = new APIClient(apiUrl, baseCtx.logger, config);

		if (!apiClient) {
			throw new Error('APIClient constructor returned null/undefined');
		}

		if (typeof apiClient.request !== 'function') {
			throw new Error('APIClient instance is missing request method');
		}

		return apiClient;
	} catch (error) {
		baseCtx.logger.error('Failed to create API client:', error);
		throw new Error(
			`API client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

type Normalized = {
	requiresAuth: boolean;
	optionalAuth: false | string;
	requiresProject: boolean;
	optionalProject: boolean;
	requiresAPIClient: boolean;
};

function normalizeReqs(def: CommandDefinition | SubcommandDefinition): Normalized {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const d: any = def as any;
	const requires = d.requires as Requires | undefined;
	const optional = d.optional as Optional | undefined;

	const requiresAuth = requires?.auth === true;
	const optionalAuthValue = optional?.auth;
	const optionalAuth: false | string =
		optionalAuthValue === true ? 'Continue without authentication' : optionalAuthValue || false;

	const requiresProject = requires?.project === true;
	const optionalProject = optional?.project === true;

	const requiresAPIClient = requires?.apiClient === true;

	return {
		requiresAuth,
		optionalAuth,
		requiresProject,
		optionalProject,
		requiresAPIClient,
	};
}

function handleProjectConfigError(error: unknown, requiresProject: boolean, logger: Logger): never {
	if (
		requiresProject &&
		error &&
		typeof error === 'object' &&
		'name' in error &&
		error.name === 'ProjectConfigNotFoundExpection'
	) {
		logger.fatal(
			'invalid project folder. use --dir to specify a different directory or change to a project folder'
		);
	}
	throw error;
}

export async function createCLI(version: string): Promise<Command> {
	const program = new Command();

	program
		.name('agentuity')
		.description('Agentuity CLI')
		.version(version, '-V, --version', 'Display version')
		.helpOption('-h, --help', 'Display help');

	program
		.option('--config <path>', 'Config file path')
		.option('--log-level <level>', 'Log level', process.env.AGENTUITY_LOG_LEVEL ?? 'info')
		.option('--log-timestamp', 'Show timestamps in log output', false)
		.option('--no-log-prefix', 'Hide log level prefixes', true)
		.option(
			'--org-id <id>',
			'Use a specific organization when performing operations',
			process.env.AGENTUITY_CLOUD_ORG_ID
		)
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

	const { requiresProject, optionalProject } = normalizeReqs(subcommand);

	if (requiresProject || optionalProject) {
		cmd.option('--dir <path>', 'project directory (default: current directory)');
	}

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
				if (opt.hasDefault) {
					const defaultValue =
						typeof opt.defaultValue === 'function' ? opt.defaultValue() : opt.defaultValue;
					cmd.option(`--no-${flag}`, desc);
					cmd.option(`--${flag}`, desc, defaultValue);
				} else {
					cmd.option(`--${flag}`, desc);
				}
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

		const normalized = normalizeReqs(subcommand);

		let project: ProjectConfig | undefined;
		let projectDir: string | undefined;
		const dirNeeded = normalized.requiresProject || normalized.optionalProject;

		if (dirNeeded) {
			const dir = (options.dir as string | undefined) ?? process.cwd();
			projectDir = dir;
			try {
				project = await loadProjectConfig(dir, baseCtx.config);
			} catch (error) {
				if (normalized.requiresProject) {
					if (
						error &&
						typeof error === 'object' &&
						'name' in error &&
						error.name === 'ProjectConfigNotFoundExpection'
					) {
						baseCtx.logger.fatal(
							'invalid project folder. use --dir to specify a different directory or change to a project folder'
						);
					}
					throw error;
				}
				// For optional projects, silently continue without project config
			}
		}

		if (normalized.requiresAuth) {
			// Create apiClient before requireAuth since login command needs it
			if (normalized.requiresAPIClient) {
				(baseCtx as Record<string, unknown>).apiClient = createAPIClient(
					baseCtx,
					baseCtx.config ?? null
				);
			}

			const auth = await requireAuth(baseCtx as CommandContext<undefined>);

			if (subcommand.schema) {
				try {
					const input = buildValidationInput(subcommand.schema, args, options);
					const ctx: Record<string, unknown> = {
						...baseCtx,
						config: {
							...(baseCtx.config ?? {}),
							auth: {
								api_key: auth.apiKey,
								user_id: auth.userId,
								expires: auth.expires.getTime(),
							},
						},
						auth,
					};
					if (project || projectDir) {
						if (project) {
							ctx.project = project;
						}
						ctx.projectDir = projectDir;
					}
					if (subcommand.schema.args) {
						ctx.args = subcommand.schema.args.parse(input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = subcommand.schema.options.parse(input.options);
					}
					if (normalized.requiresAPIClient) {
						// Recreate apiClient with auth credentials
						ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
					}
					await subcommand.handler(ctx as CommandContext);
				} catch (error) {
					if (error && typeof error === 'object' && 'issues' in error) {
						baseCtx.logger.error('Validation error:');
						const issues = (error as { issues: Array<{ path: string[]; message: string }> })
							.issues;
						for (const issue of issues) {
							baseCtx.logger.error(
								`  ${issue.path?.length ? issue.path.join('.') + ': ' : ''}${issue.message}`
							);
						}
						process.exit(1);
					}
					handleProjectConfigError(error, normalized.requiresProject, baseCtx.logger);
				}
			} else {
				const ctx: Record<string, unknown> = {
					...baseCtx,
					config: baseCtx.config
						? {
								...baseCtx.config,
								name: baseCtx.config.name ?? defaultProfileName,
								auth: {
									api_key: auth.apiKey,
									user_id: auth.userId,
									expires: auth.expires.getTime(),
								},
							}
						: null,
					auth,
				};
				if (project || projectDir) {
					if (project) {
						ctx.project = project;
					}
					ctx.projectDir = projectDir;
				}
				if (normalized.requiresAPIClient) {
					// Recreate apiClient with auth credentials
					ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
				}
				await subcommand.handler(ctx as CommandContext);
			}
		} else if (normalized.optionalAuth) {
			const continueText =
				typeof normalized.optionalAuth === 'string' ? normalized.optionalAuth : undefined;

			// Create apiClient before optionalAuth since login command needs it
			if (normalized.requiresAPIClient) {
				(baseCtx as Record<string, unknown>).apiClient = createAPIClient(
					baseCtx,
					baseCtx.config ?? null
				);
			}

			const auth = await optionalAuth(baseCtx as CommandContext<undefined>, continueText);

			if (subcommand.schema) {
				try {
					const input = buildValidationInput(subcommand.schema, args, options);
					const ctx: Record<string, unknown> = {
						...baseCtx,
						config: auth
							? {
									...(baseCtx.config ?? {}),
									auth: {
										api_key: auth.apiKey,
										user_id: auth.userId,
										expires: auth.expires.getTime(),
									},
								}
							: baseCtx.config,
						auth,
					};
					if (project || projectDir) {
						if (project) {
							ctx.project = project;
						}
						ctx.projectDir = projectDir;
					}
					if (subcommand.schema.args) {
						ctx.args = subcommand.schema.args.parse(input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = subcommand.schema.options.parse(input.options);
					}
					if (normalized.requiresAPIClient) {
						// Recreate apiClient with auth credentials
						ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
					}
					await subcommand.handler(ctx as CommandContext);
				} catch (error) {
					if (error && typeof error === 'object' && 'issues' in error) {
						baseCtx.logger.error('Validation error:');
						const issues = (error as { issues: Array<{ path: string[]; message: string }> })
							.issues;
						for (const issue of issues) {
							baseCtx.logger.error(
								`  ${issue.path?.length ? issue.path.join('.') + ': ' : ''}${issue.message}`
							);
						}
						process.exit(1);
					}
					handleProjectConfigError(error, normalized.requiresProject, baseCtx.logger);
				}
			} else {
				const ctx: Record<string, unknown> = {
					...baseCtx,
					config: auth
						? {
								...(baseCtx.config ?? {}),
								auth: {
									api_key: auth.apiKey,
									user_id: auth.userId,
									expires: auth.expires.getTime(),
								},
							}
						: baseCtx.config,
					auth,
				};
				if (project || projectDir) {
					if (project) {
						ctx.project = project;
					}
					ctx.projectDir = projectDir;
				}
				if (normalized.requiresAPIClient) {
					// Recreate apiClient with auth credentials if auth was provided
					ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
				}
				await subcommand.handler(ctx as CommandContext);
			}
		} else {
			if (subcommand.schema) {
				try {
					const input = buildValidationInput(subcommand.schema, args, options);
					const ctx: Record<string, unknown> = {
						...baseCtx,
					};
					if (project || projectDir) {
						if (project) {
							ctx.project = project;
						}
						ctx.projectDir = projectDir;
					}
					if (subcommand.schema.args) {
						ctx.args = subcommand.schema.args.parse(input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = subcommand.schema.options.parse(input.options);
					}
					if (normalized.requiresAPIClient && !ctx.apiClient) {
						ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
					}
					await subcommand.handler(ctx as CommandContext);
				} catch (error) {
					if (error && typeof error === 'object' && 'issues' in error) {
						baseCtx.logger.error('Validation error:');
						const issues = (error as { issues: Array<{ path: string[]; message: string }> })
							.issues;
						for (const issue of issues) {
							baseCtx.logger.error(
								`  ${issue.path?.length ? issue.path.join('.') + ': ' : ''}${issue.message}`
							);
						}
						process.exit(1);
					}
					handleProjectConfigError(error, normalized.requiresProject, baseCtx.logger);
				}
			} else {
				const ctx: Record<string, unknown> = {
					...baseCtx,
				};
				if (project || projectDir) {
					if (project) {
						ctx.project = project;
					}
					ctx.projectDir = projectDir;
				}
				if (normalized.requiresAPIClient && !ctx.apiClient) {
					ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
				}
				await subcommand.handler(ctx as CommandContext);
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
					const normalized = normalizeReqs(cmdDef);
					if (normalized.requiresAuth) {
						// Create apiClient before requireAuth since login command needs it
						if (normalized.requiresAPIClient) {
							(baseCtx as Record<string, unknown>).apiClient = createAPIClient(
								baseCtx,
								baseCtx.config ?? null
							);
						}

						const auth = await requireAuth(baseCtx as CommandContext<undefined>);
						const ctx: Record<string, unknown> = {
							...baseCtx,
							config: baseCtx.config
								? {
										...baseCtx.config,
										name: baseCtx.config.name ?? defaultProfileName,
										auth: {
											api_key: auth.apiKey,
											user_id: auth.userId,
											expires: auth.expires.getTime(),
										},
									}
								: null,
							auth,
						};
						if (normalized.requiresAPIClient) {
							// Recreate apiClient with auth credentials
							ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
						}
						await cmdDef.handler!(ctx as CommandContext);
					} else if (normalized.optionalAuth) {
						const continueText =
							typeof normalized.optionalAuth === 'string'
								? normalized.optionalAuth
								: undefined;

						// Create apiClient before optionalAuth since login command needs it
						if (normalized.requiresAPIClient) {
							(baseCtx as Record<string, unknown>).apiClient = createAPIClient(
								baseCtx,
								baseCtx.config ?? null
							);
						}

						const auth = await optionalAuth(
							baseCtx as CommandContext<undefined>,
							continueText
						);
						const ctx: Record<string, unknown> = {
							...baseCtx,
							config: auth
								? baseCtx.config
									? {
											...baseCtx.config,
											auth: {
												api_key: auth.apiKey,
												user_id: auth.userId,
												expires: auth.expires.getTime(),
											},
										}
									: {
											auth: {
												api_key: auth.apiKey,
												user_id: auth.userId,
												expires: auth.expires.getTime(),
											},
										}
								: baseCtx.config,
							auth,
						};
						if (normalized.requiresAPIClient) {
							// Recreate apiClient with auth credentials if auth was provided
							ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
						}
						await cmdDef.handler!(ctx as CommandContext);
					} else {
						const ctx = baseCtx as CommandContext<undefined>;
						if (normalized.requiresAPIClient && !(ctx as CommandContext).apiClient) {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(ctx as any).apiClient = createAPIClient(baseCtx, ctx.config);
						}
						await cmdDef.handler!(ctx as CommandContext);
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
