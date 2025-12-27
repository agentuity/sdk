import { StructuredError } from '@agentuity/core';

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
