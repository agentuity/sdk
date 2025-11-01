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

export type CommandContext<
	RequiresAuth extends boolean | 'optional' = false,
	RequiresProject extends boolean = false,
	RequiresAPIClient extends boolean = false,
	ArgsSchema extends z.ZodType | undefined = undefined,
	OptionsSchema extends z.ZodType | undefined = undefined,
> = (RequiresAuth extends true
	? RequiresProject extends true
		? ArgsSchema extends z.ZodType
			? OptionsSchema extends z.ZodType
				? {
						config: Config | null;
						logger: Logger;
						options: GlobalOptions;
						auth: AuthData;
						project: ProjectConfig;
						projectDir: string;
						args: z.infer<ArgsSchema>;
						opts: z.infer<OptionsSchema>;
					}
				: {
						config: Config | null;
						logger: Logger;
						options: GlobalOptions;
						auth: AuthData;
						project: ProjectConfig;
						projectDir: string;
						args: z.infer<ArgsSchema>;
					}
			: OptionsSchema extends z.ZodType
				? {
						config: Config | null;
						logger: Logger;
						options: GlobalOptions;
						auth: AuthData;
						project: ProjectConfig;
						projectDir: string;
						opts: z.infer<OptionsSchema>;
					}
				: {
						config: Config | null;
						logger: Logger;
						options: GlobalOptions;
						auth: AuthData;
						project: ProjectConfig;
						projectDir: string;
					}
		: ArgsSchema extends z.ZodType
			? OptionsSchema extends z.ZodType
				? {
						config: Config | null;
						logger: Logger;
						options: GlobalOptions;
						auth: AuthData;
						args: z.infer<ArgsSchema>;
						opts: z.infer<OptionsSchema>;
					}
				: {
						config: Config | null;
						logger: Logger;
						options: GlobalOptions;
						auth: AuthData;
						args: z.infer<ArgsSchema>;
					}
			: OptionsSchema extends z.ZodType
				? {
						config: Config | null;
						logger: Logger;
						options: GlobalOptions;
						auth: AuthData;
						opts: z.infer<OptionsSchema>;
					}
				: {
						config: Config | null;
						logger: Logger;
						options: GlobalOptions;
						auth: AuthData;
					}
	: RequiresAuth extends 'optional'
		? RequiresProject extends true
			? ArgsSchema extends z.ZodType
				? OptionsSchema extends z.ZodType
					? {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							auth: AuthData | undefined;
							project: ProjectConfig;
							projectDir: string;
							args: z.infer<ArgsSchema>;
							opts: z.infer<OptionsSchema>;
						}
					: {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							auth: AuthData | undefined;
							project: ProjectConfig;
							projectDir: string;
							args: z.infer<ArgsSchema>;
						}
				: OptionsSchema extends z.ZodType
					? {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							auth: AuthData | undefined;
							project: ProjectConfig;
							projectDir: string;
							opts: z.infer<OptionsSchema>;
						}
					: {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							auth: AuthData | undefined;
							project: ProjectConfig;
							projectDir: string;
						}
			: ArgsSchema extends z.ZodType
				? OptionsSchema extends z.ZodType
					? {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							auth: AuthData | undefined;
							args: z.infer<ArgsSchema>;
							opts: z.infer<OptionsSchema>;
						}
					: {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							auth: AuthData | undefined;
							args: z.infer<ArgsSchema>;
						}
				: OptionsSchema extends z.ZodType
					? {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							auth: AuthData | undefined;
							opts: z.infer<OptionsSchema>;
						}
					: {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							auth: AuthData | undefined;
						}
		: RequiresProject extends true
			? ArgsSchema extends z.ZodType
				? OptionsSchema extends z.ZodType
					? {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							project: ProjectConfig;
							projectDir: string;
							args: z.infer<ArgsSchema>;
							opts: z.infer<OptionsSchema>;
						}
					: {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							project: ProjectConfig;
							projectDir: string;
							args: z.infer<ArgsSchema>;
						}
				: OptionsSchema extends z.ZodType
					? {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							project: ProjectConfig;
							projectDir: string;
							opts: z.infer<OptionsSchema>;
						}
					: {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							project: ProjectConfig;
							projectDir: string;
						}
			: ArgsSchema extends z.ZodType
				? OptionsSchema extends z.ZodType
					? {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							args: z.infer<ArgsSchema>;
							opts: z.infer<OptionsSchema>;
						}
					: {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							args: z.infer<ArgsSchema>;
						}
				: OptionsSchema extends z.ZodType
					? {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
							opts: z.infer<OptionsSchema>;
						}
					: {
							config: Config | null;
							logger: Logger;
							options: GlobalOptions;
						}) &
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	(RequiresAPIClient extends true ? { apiClient: APIClient } : {});

// Helper to create subcommands with proper type inference
export function createSubcommand<
	TRequiresAuth extends boolean,
	TOptionalAuth extends boolean | string,
	TRequiresProject extends boolean,
	TRequiresAPIClient extends boolean = false,
	TArgsSchema extends z.ZodType | undefined = undefined,
	TOptionsSchema extends z.ZodType | undefined = undefined,
>(definition: {
	name: string;
	description: string;
	aliases?: string[];
	toplevel?: boolean;
	requiresAuth?: TRequiresAuth;
	optionalAuth?: TOptionalAuth;
	requiresProject?: TRequiresProject;
	requiresAPIClient?: TRequiresAPIClient;
	schema?: TArgsSchema extends z.ZodType
		? TOptionsSchema extends z.ZodType
			? { args: TArgsSchema; options: TOptionsSchema }
			: { args: TArgsSchema }
		: TOptionsSchema extends z.ZodType
			? { options: TOptionsSchema }
			: never;
	handler(
		ctx: CommandContext<
			TRequiresAuth extends true
				? true
				: TOptionalAuth extends true | string
					? 'optional'
					: false,
			TRequiresProject extends true ? true : false,
			TRequiresAPIClient extends true ? true : false,
			TArgsSchema,
			TOptionsSchema
		>
	): void | Promise<void>;
}): SubcommandDefinition {
	return definition as unknown as SubcommandDefinition;
}

// Helper to create commands with proper type inference
export function createCommand<
	TRequiresAuth extends boolean,
	TOptionalAuth extends boolean | string,
	TRequiresProject extends boolean,
	TRequiresAPIClient extends boolean = false,
	TArgsSchema extends z.ZodType | undefined = undefined,
	TOptionsSchema extends z.ZodType | undefined = undefined,
>(definition: {
	name: string;
	description: string;
	aliases?: string[];
	hidden?: boolean;
	requiresAuth?: TRequiresAuth;
	optionalAuth?: TOptionalAuth;
	requiresProject?: TRequiresProject;
	requiresAPIClient?: TRequiresAPIClient;
	schema?: TArgsSchema extends z.ZodType
		? TOptionsSchema extends z.ZodType
			? { args: TArgsSchema; options: TOptionsSchema }
			: { args: TArgsSchema }
		: TOptionsSchema extends z.ZodType
			? { options: TOptionsSchema }
			: never;
	handler?(
		ctx: CommandContext<
			TRequiresAuth extends true
				? true
				: TOptionalAuth extends true | string
					? 'optional'
					: false,
			TRequiresProject extends true ? true : false,
			TRequiresAPIClient extends true ? true : false,
			TArgsSchema,
			TOptionsSchema
		>
	): void | Promise<void>;
	subcommands?: SubcommandDefinition[];
}): CommandDefinition {
	return definition as unknown as CommandDefinition;
}

// Discriminated union for SubcommandDefinition
export type SubcommandDefinition =
	| {
			name: string;
			description: string;
			aliases?: string[];
			toplevel?: boolean;
			requiresAuth: true;
			optionalAuth?: false | string;
			requiresProject?: boolean;
			requiresAPIClient?: boolean;
			schema?: CommandSchemas;
			handler(ctx: CommandContext): void | Promise<void>;
	  }
	| {
			name: string;
			description: string;
			aliases?: string[];
			toplevel?: boolean;
			requiresAuth?: false;
			optionalAuth: true | string;
			requiresProject?: boolean;
			requiresAPIClient?: boolean;
			schema?: CommandSchemas;
			handler(ctx: CommandContext): void | Promise<void>;
	  }
	| {
			name: string;
			description: string;
			aliases?: string[];
			toplevel?: boolean;
			requiresAuth?: false;
			optionalAuth?: false;
			requiresProject?: boolean;
			requiresAPIClient?: boolean;
			schema?: CommandSchemas;
			handler(ctx: CommandContext): void | Promise<void>;
	  };

// Discriminated union for CommandDefinition
export type CommandDefinition =
	| {
			name: string;
			description: string;
			aliases?: string[];
			hidden?: boolean;
			requiresAuth: true;
			optionalAuth?: false | string;
			requiresProject?: boolean;
			requiresAPIClient?: boolean;
			schema?: CommandSchemas;
			handler?(ctx: CommandContext): void | Promise<void>;
			subcommands?: SubcommandDefinition[];
	  }
	| {
			name: string;
			description: string;
			aliases?: string[];
			hidden?: boolean;
			requiresAuth?: false;
			optionalAuth: true | string;
			requiresProject?: boolean;
			requiresAPIClient?: boolean;
			schema?: CommandSchemas;
			handler?(ctx: CommandContext): void | Promise<void>;
			subcommands?: SubcommandDefinition[];
	  }
	| {
			name: string;
			description: string;
			aliases?: string[];
			hidden?: boolean;
			requiresAuth?: false;
			optionalAuth?: false;
			requiresProject?: boolean;
			requiresAPIClient?: boolean;
			schema?: CommandSchemas;
			handler?(ctx: CommandContext): void | Promise<void>;
			subcommands?: SubcommandDefinition[];
	  };

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
