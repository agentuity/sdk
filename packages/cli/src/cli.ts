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
	AuthData,
} from './types';
import { showBanner } from './banner';
import { requireAuth, optionalAuth, requireOrg, optionalOrg as selectOptionalOrg } from './auth';
import { listRegions, type RegionList } from '@agentuity/server';
import enquirer from 'enquirer';
import * as tui from './tui';
import { parseArgsSchema, parseOptionsSchema, buildValidationInput } from './schema-parser';
import { defaultProfileName, loadProjectConfig } from './config';
import { APIClient, getAPIBaseURL, type APIClient as APIClientType } from './api';

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
	requiresOrg: boolean;
	optionalOrg: boolean;
	requiresRegions: boolean;
	requiresRegion: boolean;
	optionalRegion: boolean;
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

	const requiresOrg = requires?.org === true;
	const optionalOrg = optional?.org === true;
	const requiresRegions = requires?.regions === true;
	const requiresRegion = requires?.region === true;
	const optionalRegion = optional?.region === true;

	// Implicitly require apiClient if org or region is required or optional
	const requiresAPIClient =
		requires?.apiClient === true ||
		requiresOrg ||
		optionalOrg ||
		requiresRegion ||
		optionalRegion ||
		requiresRegions;

	return {
		requiresAuth,
		optionalAuth,
		requiresProject,
		optionalProject,
		requiresAPIClient,
		requiresOrg,
		optionalOrg,
		requiresRegions,
		requiresRegion,
		optionalRegion,
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
		.helpOption('-h, --help', 'Display help')
		.allowUnknownOption(false)
		.allowExcessArguments(false);

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

	// Handle unknown commands
	program.on('command:*', (operands: string[]) => {
		const unknownCommand = operands[0];
		console.error(`error: unknown command '${unknownCommand}'`);
		console.error();
		const availableCommands = program.commands.map((cmd) => cmd.name());
		if (availableCommands.length > 0) {
			console.error('Available commands:');
			availableCommands.forEach((name) => {
				console.error(`  ${name}`);
			});
		}
		console.error();
		console.error(`Run 'agentuity --help' for usage information.`);
		process.exit(1);
	});

	// Custom error handling for argument/command parsing errors
	program.configureOutput({
		outputError: (str, write) => {
			// Intercept commander.js error messages
			if (str.includes('too many arguments') || str.includes('unknown command')) {
				// Extract potential command name from error context
				const match = str.match(/got (\d+)/);
				if (match) {
					write(`error: unknown command or subcommand\n`);
					write(`\nRun 'agentuity --help' for available commands.\n`);
				} else {
					write(str);
				}
			} else {
				write(str);
			}
		},
	});

	return program;
}

async function getRegion(regions: RegionList): Promise<string> {
	if (regions.length === 1) {
		return regions[0].region;
	} else {
		const response = await enquirer.prompt<{ region: string }>({
			type: 'select',
			name: 'region',
			message: 'Select a cloud region:',
			choices: regions.map((r) => ({
				name: r.region,
				message: `${r.description.padEnd(15, ' ')} ${tui.muted(r.region)}`,
			})),
		});
		return response.region;
	}
}

interface ResolveRegionOptions {
	options: Record<string, unknown>;
	apiClient: APIClientType;
	logger: Logger;
	required: boolean;
}

async function resolveRegion(opts: ResolveRegionOptions): Promise<string | undefined> {
	const { options, apiClient, logger, required } = opts;

	// Fetch regions
	const regions = await listRegions(apiClient);

	// No regions available
	if (regions.length === 0) {
		if (required) {
			logger.fatal('No cloud regions available');
		}
		return undefined;
	}

	// Check if region was provided via flag
	let region = options.region as string | undefined;

	// Validate --region flag if provided
	if (region) {
		const found = regions.find((r) => r.region === region);
		if (!found) {
			logger.fatal(
				`Invalid region '${region}'. Use one of: ${regions.map((r) => r.region).join(', ')}`
			);
		}
		return region;
	}

	// Auto-select if only one region available
	if (regions.length === 1) {
		region = regions[0].region;
		if (!process.stdin.isTTY) {
			logger.trace('auto-selected region (non-TTY): %s', region);
		}
		return region;
	}

	// No flag provided - handle TTY vs non-TTY
	if (required && !process.stdin.isTTY) {
		logger.fatal('--region flag is required in non-interactive mode');
	}

	if (process.stdin.isTTY) {
		// Interactive mode - prompt user
		region = await getRegion(regions);
		return region;
	}

	// Non-interactive, optional region - return undefined
	return undefined;
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

	// Check if this subcommand has its own subcommands (nested subcommands)
	const subDef = subcommand as unknown as { subcommands?: SubcommandDefinition[] };
	if (subDef.subcommands && subDef.subcommands.length > 0) {
		// Register nested subcommands recursively
		for (const nestedSub of subDef.subcommands) {
			await registerSubcommand(cmd, nestedSub, baseCtx);
		}
		return;
	}

	const {
		requiresProject,
		optionalProject,
		requiresOrg,
		optionalOrg,
		requiresRegion,
		optionalRegion,
	} = normalizeReqs(subcommand);

	if (requiresProject || optionalProject) {
		cmd.option('--dir <path>', 'project directory (default: current directory)');
	}

	if (requiresOrg || optionalOrg) {
		cmd.option('--org-id <id>', 'organization ID');
	}

	if (requiresRegion || optionalRegion) {
		cmd.option('--region <region>', 'cloud region');
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

		if (subcommand.banner) {
			showBanner();
		}

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
					if (normalized.requiresOrg) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType }
						);
					}
					if (normalized.optionalOrg && ctx.auth) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType }
						);
					}
					if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
						const apiClient: APIClientType = ctx.apiClient as APIClientType;
						const region = await tui.spinner({
							message: 'Fetching cloud regions',
							clearOnSuccess: true,
							callback: async () => {
								return resolveRegion({
									options: options as Record<string, unknown>,
									apiClient,
									logger: baseCtx.logger,
									required: !!normalized.requiresRegion,
								});
							},
						});
						if (region) {
							ctx.region = region;
						}
					}
					if (subcommand.handler) {
						await subcommand.handler(ctx as CommandContext);
					}
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
				if (normalized.requiresOrg) {
					ctx.orgId = await requireOrg(ctx as CommandContext & { apiClient: APIClientType });
				}
				if (normalized.optionalOrg && ctx.auth) {
					ctx.orgId = await requireOrg(ctx as CommandContext & { apiClient: APIClientType });
				}
				if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
					const apiClient: APIClientType = ctx.apiClient as APIClientType;
					const region = await tui.spinner('Fetching cloud regions', async () => {
						return resolveRegion({
							options: options as Record<string, unknown>,
							apiClient,
							logger: baseCtx.logger,
							required: !!normalized.requiresRegion,
						});
					});
					if (region) {
						ctx.region = region;
					}
				}
				if (subcommand.handler) {
					await subcommand.handler(ctx as CommandContext);
				}
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
					baseCtx.logger.trace(
						'optionalAuth path: org=%s, region=%s, hasApiClient=%s, hasAuth=%s',
						normalized.optionalOrg,
						normalized.optionalRegion,
						!!ctx.apiClient,
						!!auth
					);
					if (normalized.requiresOrg && ctx.apiClient) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType }
						);
					}
					if (normalized.optionalOrg && ctx.apiClient && auth) {
						ctx.orgId = await selectOptionalOrg(
							ctx as CommandContext & { apiClient?: APIClientType; auth?: AuthData }
						);
						baseCtx.logger.trace('selected orgId: %s', ctx.orgId);
					}
					if (
						(normalized.requiresRegion || normalized.optionalRegion) &&
						ctx.apiClient &&
						auth
					) {
						const apiClient: APIClientType = ctx.apiClient as APIClientType;
						const region = await resolveRegion({
							options: options as Record<string, unknown>,
							apiClient,
							logger: baseCtx.logger,
							required: !!normalized.requiresRegion,
						});
						if (region) {
							ctx.region = region;
						}
					}
					if (subcommand.handler) {
						await subcommand.handler(ctx as CommandContext);
					}
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
				if (normalized.requiresOrg && ctx.apiClient) {
					ctx.orgId = await requireOrg(ctx as CommandContext & { apiClient: APIClientType });
				}
				if (normalized.optionalOrg && ctx.apiClient) {
					ctx.orgId = await selectOptionalOrg(
						ctx as CommandContext & { apiClient?: APIClientType; auth?: AuthData }
					);
				}
				if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
					const apiClient: APIClientType = ctx.apiClient as APIClientType;
					const region = await resolveRegion({
						options: options as Record<string, unknown>,
						apiClient,
						logger: baseCtx.logger,
						required: !!normalized.requiresRegion,
					});
					if (region) {
						ctx.region = region;
					}
				}
				if (subcommand.handler) {
					await subcommand.handler(ctx as CommandContext);
				}
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
					if (normalized.requiresOrg && ctx.apiClient) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType }
						);
					}
					if (normalized.optionalOrg && ctx.apiClient && ctx.auth) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType }
						);
					}
					if (subcommand.handler) {
						await subcommand.handler(ctx as CommandContext);
					}
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
				if (normalized.requiresOrg && ctx.apiClient) {
					ctx.orgId = await requireOrg(ctx as CommandContext & { apiClient: APIClientType });
				}
				if (normalized.optionalOrg && ctx.apiClient && ctx.auth) {
					ctx.orgId = await requireOrg(ctx as CommandContext & { apiClient: APIClientType });
				}
				if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
					const apiClient: APIClientType = ctx.apiClient as APIClientType;
					const region = await resolveRegion({
						options: options as Record<string, unknown>,
						apiClient,
						logger: baseCtx.logger,
						required: !!normalized.requiresRegion,
					});
					if (region) {
						ctx.region = region;
					}
				}
				if (subcommand.handler) {
					await subcommand.handler(ctx as CommandContext);
				}
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
					if (cmdDef.banner) {
						showBanner();
					}

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
						if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
							const apiClient: APIClientType = ctx.apiClient as APIClientType;
							const region = await resolveRegion({
								options: baseCtx.options as unknown as Record<string, unknown>,
								apiClient,
								logger: baseCtx.logger,
								required: !!normalized.requiresRegion,
							});
							if (region) {
								ctx.region = region;
							}
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
						if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
							const apiClient: APIClientType = ctx.apiClient as APIClientType;
							const region = await resolveRegion({
								options: baseCtx.options as unknown as Record<string, unknown>,
								apiClient,
								logger: baseCtx.logger,
								required: !!normalized.requiresRegion,
							});
							if (region) {
								ctx.region = region;
							}
						}
						await cmdDef.handler!(ctx as CommandContext);
					} else {
						const ctx: Record<string, unknown> = {
							...baseCtx,
						};
						if (normalized.requiresAPIClient && !(ctx as CommandContext).apiClient) {
							ctx.apiClient = createAPIClient(baseCtx, baseCtx.config);
						}
						if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
							const apiClient = ctx.apiClient as APIClientType;
							const region = await resolveRegion({
								options: baseCtx.options as unknown as Record<string, unknown>,
								apiClient,
								logger: baseCtx.logger,
								required: !!normalized.requiresRegion,
							});
							if (region) {
								ctx.region = region;
							}
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
