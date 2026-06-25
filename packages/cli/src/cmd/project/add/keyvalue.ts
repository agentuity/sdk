import {
	createResources,
	listResources,
	projectEnvUpdate,
	validateNamespaceName,
} from '@agentuity/server';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix.ts';
import { getCatalystAPIClient } from '../../../config.ts';
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

const CREATE_NEW_NAMESPACE_SENTINEL = '__create_new_namespace__';

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
		const { logger, args, orgId, region, auth, options, projectDir, project } = ctx;

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

		const catalystClient = getCatalystAPIClient(logger, auth, region, undefined, ctx.config);

		const resources = await tui.spinner({
			message: 'Fetching key-value namespaces',
			clearOnSuccess: true,
			callback: async () => listResources(catalystClient, orgId, region),
		});

		const availableNamespaces = (resources.kv ?? []).filter((namespace) => !namespace.internal);

		let selectedNamespace: (typeof availableNamespaces)[0] | undefined;

		if (args.name) {
			const namespaceName = args.name.trim();
			const validation = validateNamespaceName(namespaceName);
			if (!validation.valid) {
				tui.fatal(validation.error ?? 'Invalid namespace name', ErrorCode.INVALID_ARGUMENT);
			}

			selectedNamespace = availableNamespaces.find(
				(namespace) => namespace.name === namespaceName
			);
			if (!selectedNamespace) {
				const created = await tui.spinner({
					message: `Creating key-value namespace ${namespaceName}`,
					clearOnSuccess: true,
					callback: async () =>
						createResources(catalystClient, orgId, region, [
							{ type: 'kv', name: namespaceName },
						]),
				});
				const createdNamespace = created[0];
				if (!createdNamespace) {
					tui.fatal('Failed to create key-value namespace', ErrorCode.INTERNAL_ERROR);
				}
				selectedNamespace = {
					name: createdNamespace.name,
					env: createdNamespace.env,
					internal: false,
				};
				if (!options.json) {
					tui.success(`Created key-value namespace: ${tui.bold(createdNamespace.name)}`);
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
					{ value: CREATE_NEW_NAMESPACE_SENTINEL, label: 'Create a new namespace' },
					...availableNamespaces.map((namespace) => ({
						value: namespace.name,
						label: `${tui.tuiColors.primary(namespace.name)}`,
					})),
				],
			});

			if (process.stdin.isTTY) {
				process.stdin.pause();
			}

			if (!selected) {
				tui.fatal('Operation cancelled', ErrorCode.USER_CANCELLED);
			}

			if (selected === CREATE_NEW_NAMESPACE_SENTINEL) {
				const nameInput = await prompt.text({
					message: 'Namespace name',
					hint: '1-64 characters',
					validate: (value: string) => {
						const trimmed = value.trim();
						if (trimmed === '') {
							return 'Namespace name is required';
						}
						const result = validateNamespaceName(trimmed);
						return result.valid ? true : (result.error ?? 'Invalid namespace name');
					},
				});

				if (process.stdin.isTTY) {
					process.stdin.pause();
				}

				const namespaceName = nameInput.trim();
				selectedNamespace = availableNamespaces.find(
					(namespace) => namespace.name === namespaceName
				);
				if (!selectedNamespace) {
					const created = await tui.spinner({
						message: `Creating key-value namespace ${namespaceName}`,
						clearOnSuccess: true,
						callback: async () =>
							createResources(catalystClient, orgId, region, [
								{ type: 'kv', name: namespaceName },
							]),
					});
					const createdNamespace = created[0];
					if (!createdNamespace) {
						tui.fatal('Failed to create key-value namespace', ErrorCode.INTERNAL_ERROR);
					}
					selectedNamespace = {
						name: createdNamespace.name,
						env: createdNamespace.env,
						internal: false,
					};
					if (!options.json) {
						tui.success(`Created key-value namespace: ${tui.bold(createdNamespace.name)}`);
					}
				}
			} else {
				selectedNamespace = availableNamespaces.find(
					(namespace) => namespace.name === selected
				);
			}
		}

		if (!selectedNamespace) {
			tui.fatal('Failed to select key-value namespace', ErrorCode.INTERNAL_ERROR);
		}

		if (selectedNamespace.env && Object.keys(selectedNamespace.env).length > 0) {
			await addResourceEnvVars(projectDir, selectedNamespace.env);
			if (!options.json) {
				tui.success(`Linked key-value namespace: ${tui.bold(selectedNamespace.name)}`);
				tui.info('Environment variables written to .env');
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
		} else {
			if (!options.json) {
				tui.warning(
					`Key-value namespace "${selectedNamespace.name}" has no environment variables to add`
				);
			}
		}

		return {
			success: true,
			name: selectedNamespace.name,
		};
	},
});
