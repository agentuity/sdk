/**
 * @agentuity/local - Local development services
 *
 * Provides local storage implementations for development.
 * Runtime-specific implementations are auto-detected.
 *
 * Users can provide their own implementations via service overrides
 * by implementing these interfaces.
 */

// Re-export core interfaces so users can implement their own
export type { StreamStorage } from '@agentuity/stream';
export type { VectorStorage } from '@agentuity/vector';
export type { QueueService } from '@agentuity/queue';
export type { EmailService } from '@agentuity/email';
export type { TaskStorage } from '@agentuity/task';
export type { KeyValueStorage } from '@agentuity/keyvalue';

// Runtime detection
export { detectRuntime, isLocalAvailable, getRuntimeName, type Runtime } from './runtime';

// Bun implementations (only available when running in Bun)
export {
	getLocalDB,
	closeLocalDB,
	LocalKeyValueStorage,
	LocalStreamStorage,
	LocalVectorStorage,
	LocalQueueStorage,
	LocalEmailStorage,
	LocalTaskStorage,
	now,
	normalizeProjectPath,
} from './bun';
