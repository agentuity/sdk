import { createLogger } from '@agentuity/server';
import type { Logger } from '@agentuity/core';

/**
 * User-facing logger instance
 * This is the logger that SDK consumers should use
 */
export const logger: Logger = createLogger('info', false, 'dark');

// Re-export the Logger type for convenience
export type { Logger } from '@agentuity/core';
