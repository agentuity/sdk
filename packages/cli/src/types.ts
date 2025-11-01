import type { Logger } from '@agentuity/core';
import type * as z from 'zod';
import { z as zod } from 'zod';
import type { APIClient } from './api';

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
			api_url: zod
				.url()
				.optional()
				.describe('Override API base URL (default: https://api.agentuity.com)'),
			app_url: zod
				.url()
				.optional()
				.describe('Override app base URL (default: https://app.agentuity.com)'),
			transport_url: zod
				.url()
				.optional()
				.describe('Override transport URL (default: https://agentuity.ai)'),
			websocket_url: zod
				.url()
				.optional()
				.describe('Override WebSocket URL (default: wss://api.agentuity.com)'),
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
}

export interface CommandSchemas {
	args?: z.ZodType;
	options?: z.ZodType;
}

export type ProjectConfig = zod.infer<typeof ProjectSchema>;

export type Requires = {
	auth?: true;
	project?: true;
	apiClient?: true;
};

export type Optional = {
	auth?: true | string;
	project?: true;
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
	aliases?: string[];
	toplevel?: boolean;
	requires?: R;
	optional?: O;
	schema?: A extends z.ZodType
		? Op extends z.ZodType
			? { args: A; options: Op }
			: { args: A }
		: Op extends z.ZodType
			? { options: Op }
			: never;
	handler(ctx: CommandContext<R, O, A, Op>): void | Promise<void>;
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
	aliases?: string[];
	hidden?: boolean;
	requires?: R;
	optional?: O;
	schema?: A extends z.ZodType
		? Op extends z.ZodType
			? { args: A; options: Op }
			: { args: A }
		: Op extends z.ZodType
			? { options: Op }
			: never;
	handler?(ctx: CommandContext<R, O, A, Op>): void | Promise<void>;
	subcommands?: SubcommandDefinition[];
}): CommandDefinition {
	return definition as unknown as CommandDefinition;
}

type CommandDefBase = {
	name: string;
	description: string;
	aliases?: string[];
	schema?: CommandSchemas;
	handler?(ctx: CommandContext): void | Promise<void>;
	subcommands?: SubcommandDefinition[];
};

type SubcommandDefBase = {
	name: string;
	description: string;
	aliases?: string[];
	toplevel?: boolean;
	schema?: CommandSchemas;
	handler(ctx: CommandContext): void | Promise<void>;
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
	agents: zod.array(
		zod.object({
			id: zod.string().describe('the unique calculated id for the route'),
			filename: zod.string().describe('the relative path for the file'),
			name: zod.string().describe('the name of the agent'),
			version: zod.string().describe('the SHA256 content of the file'),
			identifier: zod.string().describe('the folder for the agent'),
			description: zod.string().optional().describe('the agent description'),
		})
	),
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
