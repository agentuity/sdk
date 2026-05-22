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
export type {
	KeyValueStorage,
	StreamStorage,
	VectorStorage,
	QueueService,
	EmailService,
	TaskStorage,
} from '@agentuity/core';

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
