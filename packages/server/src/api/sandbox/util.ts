import { StructuredError } from '@agentuity/core';
import type { EventEmitter } from 'node:events';

interface WritableWithDrain extends EventEmitter {
	write(chunk: Uint8Array): boolean;
}

/**
 * Error thrown when a sandbox API request fails.
 *
 * Includes optional context about which sandbox or execution caused the error.
 */
export const SandboxResponseError = StructuredError('SandboxResponseError')<{
	/** The sandbox ID associated with the error, if applicable */
	sandboxId?: string;
	/** The execution ID associated with the error, if applicable */
	executionId?: string;
}>();

/** Current sandbox API version */
export const API_VERSION = '2025-03-17';

/**
 * Write a chunk to a writable stream and wait for it to drain if necessary.
 * Properly cleans up event listeners to avoid memory leaks.
 */
export function writeAndDrain(writable: WritableWithDrain, chunk: Uint8Array): Promise<void> {
	return new Promise((resolve, reject) => {
		let needsDrain: boolean;
		try {
			needsDrain = !writable.write(chunk);
		} catch (err) {
			reject(err);
			return;
		}
		if (needsDrain) {
			const cleanup = () => {
				writable.removeListener('drain', onDrain);
				writable.removeListener('error', onError);
			};
			const onDrain = () => {
				cleanup();
				resolve();
			};
			const onError = (err: Error) => {
				cleanup();
				reject(err);
			};
			writable.once('drain', onDrain);
			writable.once('error', onError);
		} else {
			resolve();
		}
	});
}
