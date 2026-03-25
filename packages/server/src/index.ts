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
// TODO: Phase 2 - Migrate CLI imports to @agentuity/core directly, then remove this re-export
export * from '@agentuity/core';

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
export { bootstrapRuntimeEnv, type RuntimeBootstrapOptions } from './runtime-bootstrap.ts';
export { z } from 'zod';
