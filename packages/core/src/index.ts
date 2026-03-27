// env-example.ts exports
export type { EnvField, ResourceType } from './env-example.ts';
export { detectResourceFromKey, parseEnvExample } from './env-example.ts';

// deprecation.ts exports
export { isV1Package, showDeprecationWarning } from './deprecation';

// error.ts exports
export { isStructuredError, RichError, StructuredError } from './error.ts';

// json.ts exports
export { safeStringify } from './json.ts';

// logger.ts exports
export type { Logger, LogLevel } from './logger.ts';

// services exports
export * from './services/index.ts';

// standard_schema.ts exports
export type { StandardSchemaV1 } from './standard_schema.ts';

// string.ts exports
export { toCamelCase, toPascalCase } from './string.ts';

// typehelper.ts exports
export type { InferInput, InferOutput } from './typehelper.ts';

// webrtc.ts exports
export type * from './webrtc.ts';

// workbench exports
export {
	decodeWorkbenchConfig,
	encodeWorkbenchConfig,
	getWorkbenchConfig,
	type WorkbenchConfig,
	WorkbenchConfigError,
	WorkbenchNotFoundError,
} from './workbench-config.ts';

// Client code moved to @agentuity/frontend for better bundler compatibility
