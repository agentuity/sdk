import type { GlobalOptions } from './types';
import { isTTYLike } from './tui';

/**
 * Output formatting utilities for agent-friendly CLI
 */

// Store global options for access by output utilities
let globalOutputOptions: GlobalOptions | null = null;

/**
 * Set global output options (called during CLI initialization)
 */
export function setOutputOptions(options: GlobalOptions): void {
	globalOutputOptions = options;
}

/**
 * Get current global output options
 */
export function getOutputOptions(): GlobalOptions | null {
	return globalOutputOptions;
}

/**
 * Check if JSON output mode is enabled
 */
export function isJSONMode(options: GlobalOptions): boolean {
	return options.json === true;
}

/**
 * Check if quiet mode is enabled
 */
export function isQuietMode(options: GlobalOptions): boolean {
	return options.quiet === true;
}

/**
 * Check if progress indicators should be disabled
 */
export function shouldDisableProgress(options: GlobalOptions): boolean {
	return (
		options.noProgress === true ||
		options.json === true ||
		options.quiet === true ||
		options.logLevel === 'debug' ||
		options.logLevel === 'trace'
	);
}

/**
 * Check if colors should be disabled
 */
export function shouldDisableColors(options: GlobalOptions): boolean {
	if (options.color === 'never') {
		return true;
	}
	if (options.color === 'always') {
		return false;
	}
	// auto mode - disable in JSON/quiet mode or non-TTY
	return options.json === true || options.quiet === true || !isTTYLike();
}

/**
 * Output JSON to stdout (for agent consumption)
 */
export function outputJSON(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

/**
 * Output success message (respects quiet/json mode)
 */
export function outputSuccess(message: string, options: GlobalOptions, jsonData?: unknown): void {
	if (isJSONMode(options)) {
		if (jsonData) {
			outputJSON({ success: true, ...jsonData });
		} else {
			outputJSON({ success: true, message });
		}
	} else if (!isQuietMode(options)) {
		console.log(message);
	}
}

/**
 * Output info message (respects quiet/json mode)
 */
export function outputInfo(message: string, options: GlobalOptions): void {
	if (isJSONMode(options)) {
		// In JSON mode, info messages are typically suppressed
		// unless they're critical (use outputJSON directly for those)
		return;
	}
	if (!isQuietMode(options)) {
		console.log(message);
	}
}

/**
 * Output warning message (respects json mode but not quiet - warnings should be seen)
 */
export function outputWarning(message: string, options: GlobalOptions): void {
	if (isJSONMode(options)) {
		outputJSON({ warning: message });
	} else {
		console.warn(message);
	}
}

/**
 * Check if interactive prompts should be allowed
 */
export function canPrompt(options: GlobalOptions): boolean {
	// Disable prompts in JSON mode, quiet mode, or non-TTY
	return (
		!isJSONMode(options) && !isQuietMode(options) && process.stdin.isTTY && process.stdout.isTTY
	);
}

/**
 * Check if validate mode is enabled
 */
export function isValidateMode(options: GlobalOptions): boolean {
	return options.validate === true;
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
	timestamp?: string;
	executionTime?: string;
	pagination?: {
		total?: number;
		limit?: number;
		offset?: number;
		hasMore?: boolean;
	};
	warnings?: string[];
}

/**
 * Standard JSON response format
 */
export interface JSONResponse<T = unknown> {
	success: boolean;
	data?: T;
	message?: string;
	metadata?: ResponseMetadata;
	error?: {
		code: string;
		message: string;
		details?: Record<string, unknown>;
	};
}

/**
 * Create a success JSON response
 */
export function createSuccessResponse<T>(
	data?: T,
	message?: string,
	metadata?: ResponseMetadata
): JSONResponse<T> {
	const response: JSONResponse<T> = { success: true };
	if (data !== undefined) {
		response.data = data;
	}
	if (message) {
		response.message = message;
	}
	if (metadata) {
		response.metadata = metadata;
	}
	return response;
}

/**
 * Create an error JSON response
 */
export function createErrorResponse(
	code: string,
	message: string,
	details?: Record<string, unknown>,
	metadata?: ResponseMetadata
): JSONResponse {
	const response: JSONResponse = {
		success: false,
		error: {
			code,
			message,
			details,
		},
	};
	if (metadata) {
		response.metadata = metadata;
	}
	return response;
}

/**
 * Create response metadata with timestamp and optional execution time
 */
export function createMetadata(
	startTime?: number,
	extra?: Partial<ResponseMetadata>
): ResponseMetadata {
	const metadata: ResponseMetadata = {
		timestamp: new Date().toISOString(),
		...extra,
	};
	if (startTime !== undefined) {
		const duration = Date.now() - startTime;
		metadata.executionTime = `${duration}ms`;
	}
	return metadata;
}

/**
 * Batch operation result for a single item
 */
export interface BatchItemResult<T = unknown> {
	item: string;
	success: boolean;
	data?: T;
	error?: {
		code: string;
		message: string;
	};
}

/**
 * Batch operation result
 */
export interface BatchOperationResult<T = unknown> {
	success: boolean;
	totalItems: number;
	succeeded: number;
	failed: number;
	results: BatchItemResult<T>[];
}

/**
 * Create a batch operation result
 */
export function createBatchResult<T = unknown>(
	results: BatchItemResult<T>[]
): BatchOperationResult<T> {
	const succeeded = results.filter((r) => r.success).length;
	const failed = results.filter((r) => !r.success).length;

	return {
		success: failed === 0,
		totalItems: results.length,
		succeeded,
		failed,
		results,
	};
}

/**
 * Output batch operation result
 */
export function outputBatchResult<T = unknown>(
	result: BatchOperationResult<T>,
	options: GlobalOptions
): void {
	if (isJSONMode(options)) {
		outputJSON(result);
	} else {
		console.log(
			`Completed: ${result.succeeded}/${result.totalItems} succeeded, ${result.failed}/${result.totalItems} failed`
		);
		if (result.failed > 0) {
			console.log('\nFailed items:');
			for (const item of result.results.filter((r) => !r.success)) {
				console.log(`  ${item.item}: ${item.error?.message || 'Unknown error'}`);
			}
		}
	}
}

/**
 * Validation result
 */
export interface ValidationResult {
	valid: boolean;
	command: string;
	errors?: Array<{ field: string; message: string }>;
	warnings?: string[];
}

/**
 * Output validation result
 */
export function outputValidation(result: ValidationResult, options: GlobalOptions): void {
	if (isJSONMode(options) || options.validate) {
		outputJSON(result);
	} else {
		if (result.valid) {
			console.log('✓ Validation passed');
		} else {
			console.log('✗ Validation failed');
			if (result.errors) {
				for (const err of result.errors) {
					console.log(`  ${err.field}: ${err.message}`);
				}
			}
		}
	}
}
