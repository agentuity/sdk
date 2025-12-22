import type { Logger } from '@agentuity/core';
import {
	DeploymentConfig,
	BuildMetadataSchema as ServerBuildMetadataSchema,
} from '@agentuity/server';
import type * as z from 'zod';
import { z as zod } from 'zod';
import type { APIClient } from './api';

export { DeploymentConfig };

export type { Logger };

export const ConfigSchema = zod.object({
	name: zod.string().describe('Profile name'),
	auth: zod
		.object({
			api_key: zod.string().optional().describe('API authentication key'),
			user_id: zod.string().optional().describe('User ID'),
			expires: zod.number().optional().describe('Authentication expiration timestamp'),
		})
		.optional()
		.describe('Authentication credentials (managed by login/logout commands)'),
	devmode: zod
		.object({
			hostname: zod.string().optional().describe('Development mode hostname'),
		})
		.optional()
		.describe('Development mode configuration'),
	overrides: zod
		.object({
			api_url: zod.url().optional().describe('Override API base URL'),
			app_url: zod.url().optional().describe('Override app base URL'),
			transport_url: zod.url().optional().describe('Override transport URL'),
			stream_url: zod.url().optional().describe('Override stream URL'),
			kv_url: zod.url().optional().describe('Override keyvalue URL'),
			vector_url: zod.url().optional().describe('Override vector store URL'),
			catalyst_url: zod.url().optional().describe('Override catalyst URL'),
			ion_url: zod.url().optional().describe('Override ion URL'),
			gravity_url: zod.url().optional().describe('Override gravity URL'),
			skip_version_check: zod.boolean().optional().describe('Skip CLI version check on startup'),
		})
		.optional()
		.nullable()
		.describe('URL and behavior overrides'),
	preferences: zod
		.object({
			last_update_check: zod.number().optional().describe('Last update check timestamp'),
			last_legacy_warning: zod.number().optional().describe('Last legacy CLI warning timestamp'),
			signup_banner_shown: zod.boolean().optional().describe('If the signup banner was shown'),
			orgId: zod.string().optional().describe('Default organization ID'),
			project_dir: zod.string().optional().describe('Last used project directory'),
		})
		.optional()
		.describe('User preferences'),
	gravity: zod
		.object({
			version: zod.string().optional().describe('The current gravity version'),
			checked: zod.number().optional().describe('Last gravity check timestamp'),
		})
		.optional()
		.describe('the gravity client information'),
});

export type Config = zod.infer<typeof ConfigSchema>;

export type LogLevel = 'debug' | 'trace' | 'info' | 'warn' | 'error';

/**
 * Build phases for the bundler
 */
export type BuildPhase = 'api' | 'web' | 'workbench';

/**
 * Context provided to the build config function
 */
export interface BuildContext {
	/**
	 * The root directory of the project
	 */
	rootDir: string;
	/**
	 * Whether this is a development build
	 */
	dev: boolean;
	/**
	 * The output directory for the build
	 */
	outDir: string;
	/**
	 * The source directory
	 */
	srcDir: string;
	/**
	 * Organization ID (if available)
	 */
	orgId?: string;
	/**
	 * Project ID (if available)
	 */
	projectId?: string;
	/**
	 * Deployment region
	 */
	region: string;
	/**
	 * Logger instance
	 */
	logger: Logger;
}

/**
 * Workbench configuration
 *
 * Presence of this config object implicitly enables workbench in dev mode.
 * To disable workbench, omit this config entirely.
 */
export interface WorkbenchConfig {
	/**
	 * Route where the workbench UI will be served
	 * @default '/workbench'
	 */
	route?: string;
	/**
	 * Custom headers to send with workbench requests
	 */
	headers?: Record<string, string>;
}

/**
 * Agentuity project configuration (declarative)
 */
export interface AgentuityConfig {
	/**
	 * Workbench configuration
	 */
	workbench?: WorkbenchConfig;
	/**
	 * Vite plugins to add to the client build
	 * These are added AFTER Agentuity's built-in plugins
	 */
	plugins?: Array<import('vite').Plugin>;
	/**
	 * Additional define constants for code replacement in Vite builds
	 * These are merged with Agentuity's default defines
	 * Note: Cannot override AGENTUITY_PUBLIC_* or process.env.NODE_ENV
	 */
	define?: Record<string, string>;
}

/**
 * User-provided build configuration for a specific phase (legacy Bun bundler)
 * @deprecated Use AgentuityConfig instead
 */
export interface BuildConfig {
	/**
	 * Additional Bun plugins to apply during bundling
	 * These are added AFTER the Agentuity plugin
	 */
	plugins?: Array<import('bun').BunPlugin>;
	/**
	 * Additional external modules to exclude from bundling
	 * These are merged with Agentuity's default externals
	 */
	external?: string[];
	/**
	 * Additional define constants for code replacement
	 * These are merged with Agentuity's default defines
	 * Note: Cannot override process.env.AGENTUITY_* or process.env.NODE_ENV
	 */
	define?: Record<string, string>;
}

/**
 * Configuration function that users export from agentuity.config.ts
 */
export type BuildConfigFunction = (
	phase: BuildPhase,
	context: BuildContext
) => BuildConfig | Promise<BuildConfig>;

export interface Profile {
	name: string;
	filename: string;
	selected: boolean;
}

export interface AuthData {
	apiKey: string;
	userId: string;
	expires: Date;
}

export interface GlobalOptions {
	config?: string;
	logLevel: LogLevel;
	logTimestamp?: boolean;
	logPrefix?: boolean;
	orgId?: string;
	errorFormat?: 'json' | 'text';
	json?: boolean;
	quiet?: boolean;
	noProgress?: boolean;
	color?: 'auto' | 'always' | 'never';
	explain?: boolean;
	dryRun?: boolean;
	validate?: boolean;
	skipVersionCheck?: boolean;
}

export interface PaginationInfo {
	supported: boolean;
	defaultLimit?: number;
	maxLimit?: number;
	parameters?: {
		limit?: string;
		offset?: string;
		cursor?: string;
	};
}

export interface CommandExample {
	command: string;
	description: string;
}

export interface CommandSchemas {
	args?: z.ZodType;
	options?: z.ZodType;
	response?: z.ZodType;
}

export type ProjectConfig = zod.infer<typeof ProjectSchema>;

export type Requires = {
	auth?: true;
	project?: true;
	apiClient?: true;
	org?: true;
	regions?: true;
	region?: true;
};

export type Optional = {
	auth?: true | string;
	project?: true;
	org?: true;
	region?: true;
};

type AddArgs<A extends z.ZodType | undefined> = A extends z.ZodType
	? { args: z.infer<A> }
	: Record<string, never>;
type AddOpts<O extends z.ZodType | undefined> = O extends z.ZodType
	? { opts: z.infer<O> }
	: Record<string, never>;

type AuthMode<R extends Requires | undefined, O extends Optional | undefined> = R extends {
	auth: true;
}
	? 'required'
	: O extends { auth: true | string }
		? 'optional'
		: 'none';

type ProjectMode<R extends Requires | undefined, O extends Optional | undefined> = R extends {
	project: true;
}
	? 'required'
	: O extends { project: true }
		? 'optional'
		: 'none';

type APIClientRequired<R extends Requires | undefined> = R extends { apiClient: true }
	? true
	: false;

type AddAuth<M extends 'required' | 'optional' | 'none'> = M extends 'required'
	? { auth: AuthData }
	: M extends 'optional'
		? { auth: AuthData | undefined }
		: Record<string, never>;

type AddProject<M extends 'required' | 'optional' | 'none'> = M extends 'required'
	? { project: ProjectConfig; projectDir: string }
	: M extends 'optional'
		? { project?: ProjectConfig; projectDir: string }
		: Record<string, never>;

type OrgMode<R extends Requires | undefined, O extends Optional | undefined> = R extends {
	org: true;
}
	? 'required'
	: O extends { org: true }
		? 'optional'
		: 'none';

type AddOrg<M extends 'required' | 'optional' | 'none'> = M extends 'required'
	? { orgId: string }
	: M extends 'optional'
		? { orgId?: string }
		: Record<string, never>;

type RegionsRequired<R extends Requires | undefined> = R extends { regions: true } ? true : false;

type AddRegions<R extends boolean> = R extends true
	? { regions: Array<{ region: string; description: string }> }
	: Record<string, never>;

type RegionMode<R extends Requires | undefined, O extends Optional | undefined> = R extends {
	region: true;
}
	? 'required'
	: O extends { region: true }
		? 'optional'
		: 'none';

type AddRegionOptional<M extends 'required' | 'optional' | 'none'> = M extends 'required'
	? { region: string }
	: M extends 'optional'
		? { region?: string }
		: Record<string, never>;

export type CommandContextFromSpecs<
	R extends Requires | undefined,
	O extends Optional | undefined,
	A extends z.ZodType | undefined = undefined,
	Op extends z.ZodType | undefined = undefined,
> = {
	config: Config | null;
	logger: Logger;
	options: GlobalOptions;
} & AddArgs<A> &
	AddOpts<Op> &
	AddAuth<AuthMode<R, O>> &
	AddProject<ProjectMode<R, O>> &
	AddOrg<OrgMode<R, O>> &
	AddRegions<RegionsRequired<R>> &
	AddRegionOptional<RegionMode<R, O>> &
	(APIClientRequired<R> extends true ? { apiClient: APIClient } : Record<string, never>);

export type CommandContext<
	R extends Requires | undefined = undefined,
	O extends Optional | undefined = undefined,
	A extends z.ZodType | undefined = undefined,
	Op extends z.ZodType | undefined = undefined,
> = CommandContextFromSpecs<R, O, A, Op>;

export type WebUrl<
	R extends Requires | undefined = undefined,
	O extends Optional | undefined = undefined,
	A extends z.ZodType | undefined = undefined,
	Op extends z.ZodType | undefined = undefined,
> = string | ((ctx: CommandContext<R, O, A, Op>) => string | undefined | null);

export function createSubcommand<
	R extends Requires | undefined = undefined,
	O extends Optional | undefined = undefined,
	A extends z.ZodType | undefined = undefined,
	Op extends z.ZodType | undefined = undefined,
	Res extends z.ZodType | undefined = undefined,
>(definition: {
	name: string;
	description: string;
	banner?: true;
	aliases?: string[];
	toplevel?: boolean;
	requires?: R;
	optional?: O;
	examples?: CommandExample[];
	idempotent?: boolean;
	prerequisites?: string[];
	pagination?: PaginationInfo;
	tags?: string[];
	webUrl?: WebUrl<R, O, A, Op>;
	schema?: A extends z.ZodType
		? Op extends z.ZodType
			? Res extends z.ZodType
				? { args: A; options: Op; response: Res }
				: { args: A; options: Op; response?: z.ZodType }
			: Res extends z.ZodType
				? { args: A; response: Res }
				: { args: A; response?: z.ZodType }
		: Op extends z.ZodType
			? Res extends z.ZodType
				? { options: Op; response: Res }
				: { options: Op; response?: z.ZodType }
			: Res extends z.ZodType
				? { response: Res }
				: { response?: z.ZodType };
	handler(
		ctx: CommandContext<R, O, A, Op>
	): Res extends z.ZodType ? z.infer<Res> | Promise<z.infer<Res>> : unknown | Promise<unknown>;
}): SubcommandDefinition {
	return definition as unknown as SubcommandDefinition;
}

export function createCommand<
	R extends Requires | undefined = undefined,
	O extends Optional | undefined = undefined,
	A extends z.ZodType | undefined = undefined,
	Op extends z.ZodType | undefined = undefined,
	Res extends z.ZodType | undefined = undefined,
>(definition: {
	name: string;
	description: string;
	banner?: true;
	aliases?: string[];
	hidden?: boolean;
	executable?: boolean;
	skipUpgradeCheck?: boolean;
	requires?: R;
	optional?: O;
	examples?: CommandExample[];
	idempotent?: boolean;
	prerequisites?: string[];
	pagination?: PaginationInfo;
	tags?: string[];
	webUrl?: WebUrl<R, O, A, Op>;
	schema?: A extends z.ZodType
		? Op extends z.ZodType
			? Res extends z.ZodType
				? { args: A; options: Op; response: Res }
				: { args: A; options: Op; response?: z.ZodType }
			: Res extends z.ZodType
				? { args: A; response: Res }
				: { args: A; response?: z.ZodType }
		: Op extends z.ZodType
			? Res extends z.ZodType
				? { options: Op; response: Res }
				: { options: Op; response?: z.ZodType }
			: Res extends z.ZodType
				? { response: Res }
				: { response?: z.ZodType };
	handler?(
		ctx: CommandContext<R, O, A, Op>
	): Res extends z.ZodType ? z.infer<Res> | Promise<z.infer<Res>> : unknown | Promise<unknown>;
	subcommands?: SubcommandDefinition[];
}): CommandDefinition {
	return definition as unknown as CommandDefinition;
}

type CommandDefBase =
	| {
			name: string;
			description: string;
			aliases?: string[];
			banner?: boolean;
			executable?: boolean;
			skipUpgradeCheck?: boolean;
			examples?: CommandExample[];
			idempotent?: boolean;
			prerequisites?: string[];
			pagination?: PaginationInfo;
			tags?: string[];
			schema?: CommandSchemas;
			webUrl?: string | ((ctx: CommandContext) => string | undefined | null);
			handler(ctx: CommandContext): unknown | Promise<unknown>;
			subcommands?: SubcommandDefinition[];
	  }
	| {
			name: string;
			description: string;
			aliases?: string[];
			banner?: boolean;
			executable?: boolean;
			skipUpgradeCheck?: boolean;
			examples?: CommandExample[];
			idempotent?: boolean;
			prerequisites?: string[];
			pagination?: PaginationInfo;
			tags?: string[];
			schema?: CommandSchemas;
			webUrl?: string | ((ctx: CommandContext) => string | undefined | null);
			handler?: undefined;
			subcommands: SubcommandDefinition[];
	  };

type SubcommandDefBase =
	| {
			name: string;
			description: string;
			aliases?: string[];
			toplevel?: boolean;
			banner?: boolean;
			examples?: CommandExample[];
			idempotent?: boolean;
			prerequisites?: string[];
			pagination?: PaginationInfo;
			tags?: string[];
			schema?: CommandSchemas;
			webUrl?: string | ((ctx: CommandContext) => string | undefined | null);
			handler(ctx: CommandContext): unknown | Promise<unknown>;
			subcommands?: SubcommandDefinition[];
	  }
	| {
			name: string;
			description: string;
			aliases?: string[];
			toplevel?: boolean;
			banner?: boolean;
			examples?: CommandExample[];
			idempotent?: boolean;
			prerequisites?: string[];
			pagination?: PaginationInfo;
			tags?: string[];
			schema?: CommandSchemas;
			webUrl?: string | ((ctx: CommandContext) => string | undefined | null);
			handler?: undefined;
			subcommands: SubcommandDefinition[];
	  };

export type CommandDefinition =
	| (CommandDefBase & {
			hidden?: boolean;
			requires: Requires & { auth: true };
			optional?: Optional & { auth?: never };
	  })
	| (CommandDefBase & {
			hidden?: boolean;
			requires?: Requires & { auth?: never };
			optional: Optional & { auth: true | string };
	  })
	| (CommandDefBase & {
			hidden?: boolean;
			requires?: Requires & { auth?: never };
			optional?: Optional & { auth?: never };
	  });

export type SubcommandDefinition =
	| (SubcommandDefBase & {
			requires: Requires & { auth: true };
			optional?: Optional & { auth?: never };
	  })
	| (SubcommandDefBase & {
			requires?: Requires & { auth?: never };
			optional: Optional & { auth: true | string };
	  })
	| (SubcommandDefBase & {
			requires?: Requires & { auth?: never };
			optional?: Optional & { auth?: never };
	  });

export const ProjectSchema = zod.object({
	projectId: zod.string().describe('the project id'),
	orgId: zod.string().describe('the organization id'),
	region: zod.string().describe('the region identifier that the project is deployed into'),
	deployment: DeploymentConfig.optional().describe('the deployment configuration'),
});

export const BuildMetadataSchema = ServerBuildMetadataSchema;
export type BuildMetadata = zod.infer<typeof BuildMetadataSchema>;
export type Project = zod.infer<typeof ProjectSchema>;
