import { projectEnvUpdate } from '@agentuity/server';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix.ts';
import { getCatalystAPIClient } from '../../../config.ts';
import { createStorageAdapter } from '../../cloud/keyvalue/util.ts';
import {
	addResourceEnvVars,
	filterAgentuitySdkKeys,
	findExistingEnvFile,
	readEnvFile,
	splitEnvAndSecrets,
} from '../../../env-util.ts';
import { ErrorCode } from '../../../errors.ts';
import { isDryRunMode, outputDryRun } from '../../../explain.ts';
import * as tui from '../../../tui.ts';
import { createPrompt } from '../../../tui.ts';
import { createSubcommand } from '../../../types.ts';

export const KEYVALUE_NAMESPACE_ENV_KEY = 'AGENTUITY_KEYVALUE_NAMESPACE';

const namespaceNameSchema = z.string().min(1).max(64);

export const keyvalueSubcommand = createSubcommand({
	name: 'keyvalue',
	aliases: ['kv'],
	description: 'Link a key-value namespace to the current project',
	tags: ['mutating', 'fast', 'requires-auth', 'requires-project'],
	idempotent: true,
	requires: { auth: true, org: true, region: true, project: true },
	examples: [
		{
			command: getCommand('project add keyvalue'),
			description: 'Select a key-value namespace interactively',
		},
		{
			command: getCommand('project add kv production'),
			description: 'Link a specific namespace by name',
		},
		{
			command: getCommand('--dry-run project add keyvalue production'),
			description: 'Preview linking without making changes',
		},
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('Key-value namespace name to link'),
		}),
		options: z.object({}),
		response: z.object({
			success: z.boolean().describe('Whether linking succeeded'),
			name: z.string().describe('Linked namespace name'),
		}),
	},

	async handler(ctx) {
		const { logger, args, region, auth, options, projectDir, project } = ctx;

		if (isDryRunMode(options)) {
			const message = args.name
				? `Would link key-value namespace "${args.name}" to project in ${projectDir}`
				: `Would prompt to select a key-value namespace to link to project in ${projectDir}`;
			outputDryRun(message, options);
			if (!options.json) {
				tui.newline();
				tui.info('[DRY RUN] Key-value namespace linking skipped');
			}
			return {
				success: false,
				name: args.name || 'dry-run-kv',
			};
		}

		const kv = await createStorageAdapter(ctx);
		const existingNamespaces = await tui.spinner({
			message: 'Fetching key-value namespaces',
			clearOnSuccess: true,
			callback: async () => kv.getNamespaces(),
		});

		let namespaceName: string | undefined;

		if (args.name) {
			const parsed = namespaceNameSchema.safeParse(args.name);
			if (!parsed.success) {
				tui.fatal(
					`Invalid namespace name "${args.name}". Namespace names must be 1-64 characters.`,
					ErrorCode.INVALID_ARGUMENT
				);
			}
			namespaceName = parsed.data;

			if (!existingNamespaces.includes(namespaceName)) {
				await tui.spinner({
					message: `Creating key-value namespace ${namespaceName}`,
					clearOnSuccess: true,
					callback: async () => {
						await kv.createNamespace(namespaceName!);
					},
				});
				if (!options.json) {
					tui.success(`Created key-value namespace: ${tui.bold(namespaceName)}`);
				}
			}
		} else {
			const isHeadless = !process.stdin.isTTY || !process.stdout.isTTY;
			if (isHeadless) {
				tui.fatal(
					'Namespace name is required in non-interactive mode. Usage: ' +
						tui.bold(getCommand('project add keyvalue <name>')),
					ErrorCode.MISSING_ARGUMENT
				);
			}

			const prompt = createPrompt();
			const selected = await prompt.select<string>({
				message: 'Select a key-value namespace to link',
				options: [
					{ value: 'Create New', label: 'Create a new namespace' },
					...existingNamespaces.map((name) => ({
						value: name,
						label: `${tui.tuiColors.primary(name)}`,
					})),
				],
			});

			if (process.stdin.isTTY) {
				process.stdin.pause();
			}

			if (!selected) {
				tui.fatal('Operation cancelled', ErrorCode.USER_CANCELLED);
			}

			if (selected === 'Create New') {
				const nameInput = await prompt.text({
					message: 'Namespace name',
					hint: '1-64 characters',
					validate: (value: string) => {
						const trimmed = value.trim();
						if (trimmed === '') {
							return 'Namespace name is required';
						}
						const result = namespaceNameSchema.safeParse(trimmed);
						return result.success ? true : 'Namespace name must be 1-64 characters';
					},
				});

				if (process.stdin.isTTY) {
					process.stdin.pause();
				}

				namespaceName = namespaceNameSchema.parse(nameInput.trim());

				if (!existingNamespaces.includes(namespaceName)) {
					await tui.spinner({
						message: `Creating key-value namespace ${namespaceName}`,
						clearOnSuccess: true,
						callback: async () => {
							await kv.createNamespace(namespaceName!);
						},
					});
					if (!options.json) {
						tui.success(`Created key-value namespace: ${tui.bold(namespaceName)}`);
					}
				}
			} else {
				namespaceName = selected;
			}
		}

		if (!namespaceName) {
			tui.fatal('Failed to select key-value namespace', ErrorCode.INTERNAL_ERROR);
		}

		await addResourceEnvVars(projectDir, {
			[KEYVALUE_NAMESPACE_ENV_KEY]: namespaceName,
		});

		if (!options.json) {
			tui.success(`Linked key-value namespace: ${tui.bold(namespaceName)}`);
			tui.info(`Environment variable ${KEYVALUE_NAMESPACE_ENV_KEY} written to .env`);
		}

		const isHeadless = !process.stdin.isTTY || !process.stdout.isTTY;
		let shouldSync = true;

		if (!isHeadless && !options.json) {
			shouldSync = await tui.confirm('Sync environment variables to cloud project?', true);
			if (process.stdin.isTTY) {
				process.stdin.pause();
			}
		}

		if (shouldSync) {
			const catalystClient = getCatalystAPIClient(logger, auth, region, undefined, ctx.config);

			try {
				const envFilePath = await findExistingEnvFile(projectDir);
				const localEnv = await readEnvFile(envFilePath);
				const filteredEnv = filterAgentuitySdkKeys(localEnv);

				if (Object.keys(filteredEnv).length > 0) {
					const { env, secrets } = splitEnvAndSecrets(filteredEnv);
					await tui.spinner({
						message: 'Syncing environment variables to cloud',
						clearOnSuccess: true,
						callback: async () => {
							await projectEnvUpdate(catalystClient, {
								id: project.projectId,
								env,
								secrets,
							});
						},
					});
					if (!options.json) {
						tui.success('Environment variables synced to cloud');
					}
				}
			} catch (error) {
				if (!options.json) {
					tui.warning(
						'Failed to sync environment variables to cloud. You can sync later with: ' +
							tui.bold(getCommand('cloud env push'))
					);
				}
				logger.debug('Failed to sync env to cloud:', error);
			}
		}

		return {
			success: true,
			name: namespaceName,
		};
	},
});
