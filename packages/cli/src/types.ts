import type { Command as CommanderCommand } from 'commander';
import type { Logger } from './logger';

export type Config = Record<string, unknown>;

export type LogLevel = 'debug' | 'trace' | 'info' | 'warn' | 'error';

export interface GlobalOptions {
	config?: string;
	logLevel: LogLevel;
	logTimestamp?: boolean;
}

export interface CommandContext {
	config: Config;
	logger: Logger;
	options: GlobalOptions;
}

export interface SubcommandDefinition {
	name: string;
	description: string;
	register(parent: CommanderCommand, ctx: CommandContext): void;
}

export interface CommandDefinition {
	name: string;
	description: string;
	subcommands?: SubcommandDefinition[];
	register(program: CommanderCommand, ctx: CommandContext): void;
}
