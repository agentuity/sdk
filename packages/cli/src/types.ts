import type { Logger } from './logger';
import type * as z from 'zod';

export type Config = Record<string, unknown>;

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
}

export interface CommandSchemas {
	args?: z.ZodType;
	options?: z.ZodType;
}

export type CommandContext<
	RequiresAuth extends boolean = false,
	ArgsSchema extends z.ZodType | undefined = undefined,
	OptionsSchema extends z.ZodType | undefined = undefined,
> = RequiresAuth extends true
	? ArgsSchema extends z.ZodType
		? OptionsSchema extends z.ZodType
			? {
					config: Config;
					logger: Logger;
					options: GlobalOptions;
					auth: AuthData;
					args: z.infer<ArgsSchema>;
					opts: z.infer<OptionsSchema>;
				}
			: {
					config: Config;
					logger: Logger;
					options: GlobalOptions;
					auth: AuthData;
					args: z.infer<ArgsSchema>;
				}
		: OptionsSchema extends z.ZodType
			? {
					config: Config;
					logger: Logger;
					options: GlobalOptions;
					auth: AuthData;
					opts: z.infer<OptionsSchema>;
				}
			: {
					config: Config;
					logger: Logger;
					options: GlobalOptions;
					auth: AuthData;
				}
	: ArgsSchema extends z.ZodType
		? OptionsSchema extends z.ZodType
			? {
					config: Config;
					logger: Logger;
					options: GlobalOptions;
					args: z.infer<ArgsSchema>;
					opts: z.infer<OptionsSchema>;
				}
			: {
					config: Config;
					logger: Logger;
					options: GlobalOptions;
					args: z.infer<ArgsSchema>;
				}
		: OptionsSchema extends z.ZodType
			? {
					config: Config;
					logger: Logger;
					options: GlobalOptions;
					opts: z.infer<OptionsSchema>;
				}
			: {
					config: Config;
					logger: Logger;
					options: GlobalOptions;
				};

// Helper to create subcommands with proper type inference
export function createSubcommand<
	TRequiresAuth extends boolean,
	TArgsSchema extends z.ZodType | undefined,
	TOptionsSchema extends z.ZodType | undefined,
>(definition: {
	name: string;
	description: string;
	aliases?: string[];
	requiresAuth?: TRequiresAuth;
	schema?: TArgsSchema extends z.ZodType
		? TOptionsSchema extends z.ZodType
			? { args: TArgsSchema; options: TOptionsSchema }
			: { args: TArgsSchema }
		: TOptionsSchema extends z.ZodType
			? { options: TOptionsSchema }
			: never;
	handler(
		ctx: CommandContext<TRequiresAuth extends true ? true : false, TArgsSchema, TOptionsSchema>
	): void | Promise<void>;
}): SubcommandDefinition {
	return definition as unknown as SubcommandDefinition;
}

// Helper to create commands with proper type inference
export function createCommand<
	TRequiresAuth extends boolean,
	TArgsSchema extends z.ZodType | undefined,
	TOptionsSchema extends z.ZodType | undefined,
>(definition: {
	name: string;
	description: string;
	aliases?: string[];
	requiresAuth?: TRequiresAuth;
	schema?: TArgsSchema extends z.ZodType
		? TOptionsSchema extends z.ZodType
			? { args: TArgsSchema; options: TOptionsSchema }
			: { args: TArgsSchema }
		: TOptionsSchema extends z.ZodType
			? { options: TOptionsSchema }
			: never;
	handler?(
		ctx: CommandContext<TRequiresAuth extends true ? true : false, TArgsSchema, TOptionsSchema>
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
			requiresAuth: true;
			schema?: CommandSchemas;
			handler(ctx: CommandContext): void | Promise<void>;
	  }
	| {
			name: string;
			description: string;
			aliases?: string[];
			requiresAuth?: false;
			schema?: CommandSchemas;
			handler(ctx: CommandContext): void | Promise<void>;
	  };

// Discriminated union for CommandDefinition
export type CommandDefinition =
	| {
			name: string;
			description: string;
			aliases?: string[];
			requiresAuth: true;
			schema?: CommandSchemas;
			handler?(ctx: CommandContext): void | Promise<void>;
			subcommands?: SubcommandDefinition[];
	  }
	| {
			name: string;
			description: string;
			aliases?: string[];
			requiresAuth?: false;
			schema?: CommandSchemas;
			handler?(ctx: CommandContext): void | Promise<void>;
			subcommands?: SubcommandDefinition[];
	  };
