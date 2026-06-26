import { DBClient, DbWALNotEnabledError, DbWALConnectionResponseSchema } from '@agentuity/db';
import { listOrgResources } from '@agentuity/server';
import { z } from 'zod';
import { getResourceInfo, setResourceInfo } from '../../../cache/index.ts';
import { getCatalystUrl } from '../../../catalyst.ts';
import { getCommand } from '../../../command-prefix.ts';
import { getGlobalCatalystAPIClient, loadProjectSDKKey } from '../../../config.ts';
import { ErrorCode } from '../../../errors.ts';
import { isJSONMode } from '../../../output.ts';
import * as tui from '../../../tui.ts';
import { createSubcommand } from '../../../types.ts';

export const walSubcommand = createSubcommand({
	name: 'wal',
	description: 'Get a WAL/replication connection string for a database',
	tags: ['slow', 'requires-auth', 'mutating'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud db wal my-database'),
			description: 'Get WAL connection string (requires logical replication enabled)',
		},
		{
			command: getCommand('cloud db wal my-database --enable'),
			description: 'Enable logical replication and return WAL connection string',
		},
		{
			command: getCommand('cloud db wal my-database --enable --show-credentials'),
			description: 'Show full WAL connection URL in terminal output',
		},
	],
	resourceRules: [
		{
			resource: 'org',
			required: false,
			flag: 'org-id',
			envVar: 'AGENTUITY_CLOUD_ORG_ID',
			canUseCache: true,
		},
	],
	schema: {
		args: z.object({
			name: z.string().describe('Database name'),
		}),
		options: z.object({
			enable: z
				.boolean()
				.optional()
				.describe('Enable logical replication if not already enabled (irreversible)'),
			showCredentials: z
				.boolean()
				.optional()
				.describe(
					'Show credentials in plain text (default: masked in terminal, unmasked in JSON)'
				),
		}),
		response: DbWALConnectionResponseSchema,
	},
	async handler(ctx) {
		const { args, opts, options, logger, auth, config, projectDir } = ctx;
		const json = isJSONMode(options);
		const profileName = config?.name ?? 'production';
		const resolvedProjectDir = projectDir ?? process.cwd();

		const sdkKey =
			(await loadProjectSDKKey(logger, resolvedProjectDir)) ??
			process.env.AGENTUITY_SDK_KEY?.trim();
		if (!sdkKey) {
			tui.fatal(
				'WAL connection requires AGENTUITY_SDK_KEY. Run from a linked project directory with .env, or set AGENTUITY_SDK_KEY in the environment.',
				ErrorCode.INVALID_ARGUMENT
			);
		}

		try {
			const globalClient = await getGlobalCatalystAPIClient(
				logger,
				auth,
				profileName,
				undefined,
				config
			);

			const cachedInfo = await getResourceInfo('db', profileName, args.name);
			const orgId = ctx.orgId ?? cachedInfo?.orgId;

			if (!orgId) {
				tui.fatal(
					`Organization not found for database '${args.name}'. Run '${getCommand('cloud db list')}' first or specify --org-id.`,
					ErrorCode.INVALID_ARGUMENT
				);
			}

			const resources = json
				? await listOrgResources(globalClient, { type: 'db', orgId })
				: await tui.spinner({
						message: `Looking up database ${args.name}`,
						clearOnSuccess: true,
						callback: async () => listOrgResources(globalClient, { type: 'db', orgId }),
					});

			const database = resources.db.find((db) => db.name === args.name);
			if (!database) {
				tui.fatal(`Database '${args.name}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}

			const region = database.cloud_region;
			await setResourceInfo('db', profileName, database.name, region, orgId);

			const dbClient = new DBClient({
				apiKey: sdkKey,
				url: getCatalystUrl(region, config?.overrides),
				database: args.name,
				orgId,
				region,
				logger,
			});

			const fetchWalConnection = () => dbClient.walConnection({ enable: opts.enable });
			const connection = json
				? await fetchWalConnection()
				: await tui.spinner({
						message: opts.enable
							? `Enabling logical replication and fetching WAL connection for ${args.name}`
							: `Fetching WAL connection for ${args.name}`,
						clearOnSuccess: true,
						callback: fetchWalConnection,
					});

			const shouldShowCredentials = opts.showCredentials === true;
			const shouldMask = !json && !shouldShowCredentials;

			if (!json) {
				const tableData: Record<string, string> = {
					Database: tui.bold(args.name),
					Region: region,
					Username: connection.username,
					'Logical replication': connection.logical_replication_enabled
						? 'enabled'
						: 'disabled',
					'Upstream mode': connection.upstream_mode,
					URL: shouldMask ? tui.maskSecret(connection.url) : connection.url,
				};
				tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
			}

			return connection;
		} catch (ex) {
			if (ex instanceof DbWALNotEnabledError) {
				tui.fatal(
					`${ex.message} Retry with --enable to enable logical replication (irreversible).`,
					ErrorCode.INVALID_ARGUMENT
				);
			}
			tui.fatal(`Failed to get WAL connection: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
