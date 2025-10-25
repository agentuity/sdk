import ConsoleLogger from './console';
import type { Logger } from './logger';

/**
 * User-facing logger instance
 * This is the logger that SDK consumers should use
 */
export const logger: Logger = new ConsoleLogger();

// Re-export the Logger type for convenience
export type { Logger } from './logger';
