import { type ColorScheme, createLogger } from '@agentuity/server';
import type { LogLevel, Logger } from '@agentuity/core';

/**
 * User-facing logger instance
 * This is the logger that SDK consumers should use
 */
export const logger: Logger = createLogger(
	(process.env.AGENTUITY_LOG_LEVEL || 'info') as LogLevel,
	false,
	(process.env.COLOR_SCHEME ?? 'dark') as ColorScheme
);

// Re-export the Logger type for convenience
export type { Logger } from '@agentuity/core';
