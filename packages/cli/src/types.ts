import type { Logger } from './logger';
import type * as z from 'zod';
import { z as zod } from 'zod';

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
}

export interface CommandSchemas {
	args?: z.ZodType;
	options?: z.ZodType;
}

export type CommandContext<
	RequiresAuth extends boolean | 'optional' = false,
	ArgsSchema extends z.ZodType | undefined = undefined,
	OptionsSchema extends z.ZodType | undefined = undefined,
> = RequiresAuth extends true
	? ArgsSchema extends z.ZodType
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
		? ArgsSchema extends z.ZodType
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
					};

// Helper to create subcommands with proper type inference
export function createSubcommand<
	TRequiresAuth extends boolean,
	TOptionalAuth extends boolean | string,
	TArgsSchema extends z.ZodType | undefined,
	TOptionsSchema extends z.ZodType | undefined,
>(definition: {
	name: string;
	description: string;
	aliases?: string[];
	toplevel?: boolean;
	requiresAuth?: TRequiresAuth;
	optionalAuth?: TOptionalAuth;
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
	TArgsSchema extends z.ZodType | undefined,
	TOptionsSchema extends z.ZodType | undefined,
>(definition: {
	name: string;
	description: string;
	aliases?: string[];
	hidden?: boolean;
	requiresAuth?: TRequiresAuth;
	optionalAuth?: TOptionalAuth;
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
			schema?: CommandSchemas;
			handler?(ctx: CommandContext): void | Promise<void>;
			subcommands?: SubcommandDefinition[];
	  };

export const ProjectSchema = zod.object({
	projectId: zod.string().describe('the project id'),
	orgId: zod.string().describe('the organization id'),
});
