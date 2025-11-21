import type { Logger } from '@agentuity/core';
import { Deployment } from '@agentuity/server';
import type * as z from 'zod';
import { z as zod } from 'zod';
import type { APIClient } from './api';

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
			api_url: zod.url().default('https://api.agentuity.com').describe('Override API base URL'),
			app_url: zod.url().default('https://app.agentuity.com').describe('Override app base URL'),
			transport_url: zod
				.url()
				.default('https://catalyst.agentuity.cloud')
				.describe('Override transport URL'),
			stream_url: zod
				.url()
				.default('https://stream.agentuity.cloud')
				.describe('Override stream URL'),
			kv_url: zod
				.url()
				.default('https://catalyst.agentuity.cloud')
				.describe('Override keyvalue URL'),
			object_url: zod
				.url()
				.default('https://catalyst.agentuity.cloud')
				.describe('Override object store URL'),
			vector_url: zod
				.url()
				.default('https://catalyst.agentuity.cloud')
				.describe('Override vector store URL'),
			catalyst_url: zod
				.url()
				.default('https://catalyst.agentuity.cloud')
				.describe('Override catalyst URL'),
			ion_url: zod
				.url()
				.optional()
				.default('https://ion.agentuity.cloud')
				.describe('Override ion URL'),
			gravity_url: zod
				.url()
				.default('grpc://devmode.agentuity.com')
				.describe('Override gravity URL'),
			skip_version_check: zod.boolean().optional().describe('Skip CLI version check on startup'),
		})
		.optional()
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

export function createSubcommand<
	R extends Requires | undefined = undefined,
	O extends Optional | undefined = undefined,
	A extends z.ZodType | undefined = undefined,
	Op extends z.ZodType | undefined = undefined,
>(definition: {
	name: string;
	description: string;
	banner?: true;
	aliases?: string[];
	toplevel?: boolean;
	requires?: R;
	optional?: O;
	examples?: string[];
	idempotent?: boolean;
	prerequisites?: string[];
	pagination?: PaginationInfo;
	tags?: string[];
	schema?: A extends z.ZodType
		? Op extends z.ZodType
			? { args: A; options: Op; response?: z.ZodType }
			: { args: A; response?: z.ZodType }
		: Op extends z.ZodType
			? { options: Op; response?: z.ZodType }
			: { response?: z.ZodType };
	handler(ctx: CommandContext<R, O, A, Op>): unknown | Promise<unknown>;
}): SubcommandDefinition {
	return definition as unknown as SubcommandDefinition;
}

export function createCommand<
	R extends Requires | undefined = undefined,
	O extends Optional | undefined = undefined,
	A extends z.ZodType | undefined = undefined,
	Op extends z.ZodType | undefined = undefined,
>(definition: {
	name: string;
	description: string;
	banner?: true;
	aliases?: string[];
	hidden?: boolean;
	requires?: R;
	optional?: O;
	examples?: string[];
	idempotent?: boolean;
	prerequisites?: string[];
	pagination?: PaginationInfo;
	tags?: string[];
	schema?: A extends z.ZodType
		? Op extends z.ZodType
			? { args: A; options: Op; response?: z.ZodType }
			: { args: A; response?: z.ZodType }
		: Op extends z.ZodType
			? { options: Op; response?: z.ZodType }
			: { response?: z.ZodType };
	handler?(ctx: CommandContext<R, O, A, Op>): unknown | Promise<unknown>;
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
			examples?: string[];
			idempotent?: boolean;
			prerequisites?: string[];
			pagination?: PaginationInfo;
			tags?: string[];
			schema?: CommandSchemas;
			handler(ctx: CommandContext): unknown | Promise<unknown>;
			subcommands?: SubcommandDefinition[];
	  }
	| {
			name: string;
			description: string;
			aliases?: string[];
			banner?: boolean;
			examples?: string[];
			idempotent?: boolean;
			prerequisites?: string[];
			pagination?: PaginationInfo;
			tags?: string[];
			schema?: CommandSchemas;
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
			examples?: string[];
			idempotent?: boolean;
			prerequisites?: string[];
			pagination?: PaginationInfo;
			tags?: string[];
			schema?: CommandSchemas;
			handler(ctx: CommandContext): unknown | Promise<unknown>;
			subcommands?: SubcommandDefinition[];
	  }
	| {
			name: string;
			description: string;
			aliases?: string[];
			toplevel?: boolean;
			banner?: boolean;
			examples?: string[];
			idempotent?: boolean;
			prerequisites?: string[];
			pagination?: PaginationInfo;
			tags?: string[];
			schema?: CommandSchemas;
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
	deployment: Deployment.optional().describe('the deployment configuration'),
});

const FileFields = {
	filename: zod.string().describe('the relative path for the file'),
	version: zod.string().describe('the SHA256 content of the file'),
	identifier: zod.string().describe('the folder for the file'),
};

const BaseAgentFields = {
	...FileFields,
	id: zod.string().describe('the unique calculated id for the agent'),
	name: zod.string().describe('the name of the agent'),
	description: zod.string().optional().describe('the agent description'),
	evals: zod
		.array(
			zod.object({
				...FileFields,
				name: zod.string().describe('the name of the eval'),
				description: zod.string().optional().describe('the eval description'),
			})
		)
		.optional()
		.describe('the evals for the agent'),
};

const AgentSchema = zod.object({
	...BaseAgentFields,
	subagents: zod.array(zod.object(BaseAgentFields)).optional().describe('subagents of this agent'),
});

export const BuildMetadataSchema = zod.object({
	routes: zod.array(
		zod.object({
			id: zod.string().describe('the unique calculated id for the route'),
			filename: zod.string().describe('the relative path for the file'),
			path: zod.string().describe('the route path'),
			method: zod.enum(['get', 'post', 'put', 'delete', 'patch']).describe('the HTTP method'),
			version: zod.string().describe('the SHA256 content of the file'),
			type: zod.enum(['api', 'sms', 'email', 'cron', 'websocket', 'sse', 'stream']),
			config: zod
				.record(zod.string(), zod.unknown())
				.optional()
				.describe('type specific configuration'),
		})
	),
	agents: zod.array(AgentSchema),
	assets: zod.array(
		zod.object({
			filename: zod.string().describe('the relative path for the file'),
			kind: zod.string().describe('the type of asset'),
			contentType: zod.string().describe('the content-type for the file'),
			size: zod.number().describe('the size in bytes for the file'),
		})
	),
	project: zod.object({
		id: zod.string().describe('the project id'),
		name: zod.string().describe('the name of the project (from package.json)'),
		version: zod.string().optional().describe('the version of the project (from package.json)'),
	}),
	deployment: zod.object({
		id: zod.string().describe('the deployment id'),
		date: zod.string().describe('the date the deployment was created in UTC format'),
		git: zod
			.object({
				repo: zod.string().optional().describe('the repository name'),
				commit: zod.string().optional().describe('the git commit sha'),
				message: zod.string().optional().describe('the git commit message'),
				branch: zod.string().optional().describe('the git branch'),
				tags: zod.array(zod.string()).optional().describe('the tags for the current branch'),
				pr: zod.string().optional().describe('the pull request number'),
			})
			.optional()
			.describe('git commit information'),
		build: zod.object({
			bun: zod.string().describe('the version of bun that was used to build the deployment'),
			agentuity: zod.string().describe('the version of the agentuity runtime'),
			arch: zod.string().describe('the machine architecture'),
			platform: zod.string().describe('the machine os platform'),
		}),
	}),
});

export type BuildMetadata = zod.infer<typeof BuildMetadataSchema>;
export type Project = zod.infer<typeof ProjectSchema>;
