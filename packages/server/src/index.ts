// Re-export adapter functions (backward compatibility - prefer @agentuity/adapter)
export {
	createServerFetchAdapter,
	buildClientHeaders,
	type BuildClientHeadersOptions,
	type ServiceAdapterConfig,
	redact,
} from '@agentuity/adapter';

// Re-export commonly used types from core
// Note: Full re-export maintained for backward compatibility with CLI and other packages
export * from '@agentuity/core';

// Platform APIs owned by @agentuity/server (core copies retained for subpath exports until Phase 5)
export * from './api/user/index.ts';
export * from './api/org/index.ts';
export * from './api/project/index.ts';
export * from './api/region/index.ts';
export * from './api/session/index.ts';
export * from './api/thread/index.ts';
export * from './api/apikey/index.ts';

// Server-specific exports (these remain in @agentuity/server only)
export { type ColorScheme, ConsoleLogger, createLogger } from './logger.ts';
export { toJSONSchema } from './schema.ts';
export { getContentType, mimeTypes } from './util/mime.ts';
export {
	validateCPUSpec,
	validateMemorySpec,
	validateResources,
	type ResourceValidationResult,
	type ResourcesConfig,
	type ValidatedResources,
} from './util/resources.ts';
export { z } from 'zod';
