import type { Logger } from './types.ts';

/**
 * Standard exit codes for the CLI.
 *
 * Values start at 10 to avoid collisions with Unix signal numbers (1-9)
 * and shell conventions (e.g. 2 = misuse of builtins, 9 = SIGKILL/OOM).
 * Range 10-125 is safe — below shell-reserved 126-128 and signal-death
 * codes 128+N.
 *
 * 0 and 1 are kept as universal success/failure codes.
 */
export enum ExitCode {
	SUCCESS = 0,
	GENERAL_ERROR = 1,
	VALIDATION_ERROR = 10,
	AUTH_ERROR = 11,
	NOT_FOUND = 12,
	PERMISSION_ERROR = 13,
	NETWORK_ERROR = 14,
	FILE_ERROR = 15,
	USER_CANCELLED = 16,
	BUILD_FAILED = 17,
	SECURITY_ERROR = 18,
	PAYMENT_REQUIRED = 19,
	UPGRADE_REQUIRED = 20,
}

/**
 * Human-readable descriptions for each exit code.
 * This is the single source of truth consumed by the schema generator and AI help.
 */
export const exitCodeDescriptions: Record<number, string> = {
	[ExitCode.SUCCESS]: 'Success',
	[ExitCode.GENERAL_ERROR]: 'General error',
	[ExitCode.VALIDATION_ERROR]: 'Validation error (invalid arguments or options)',
	[ExitCode.AUTH_ERROR]: 'Authentication error (login required or credentials invalid)',
	[ExitCode.NOT_FOUND]: 'Resource not found (project, file, deployment, etc.)',
	[ExitCode.PERMISSION_ERROR]: 'Permission denied (insufficient access rights)',
	[ExitCode.NETWORK_ERROR]: 'Network error (API unreachable or timeout)',
	[ExitCode.FILE_ERROR]: 'File system error (file read/write failed)',
	[ExitCode.USER_CANCELLED]: 'User cancelled (operation aborted by user)',
	[ExitCode.BUILD_FAILED]: 'Build failed',
	[ExitCode.SECURITY_ERROR]: 'Security error (malware detected)',
	[ExitCode.PAYMENT_REQUIRED]: 'Payment required (plan upgrade needed)',
	[ExitCode.UPGRADE_REQUIRED]: 'Upgrade required (CLI version too old)',
};

/**
 * Standard error codes for the CLI
 */
export enum ErrorCode {
	// Validation errors
	VALIDATION_FAILED = 'VALIDATION_FAILED',
	MISSING_ARGUMENT = 'MISSING_ARGUMENT',
	INVALID_ARGUMENT = 'INVALID_ARGUMENT',
	INVALID_OPTION = 'INVALID_OPTION',
	UNKNOWN_COMMAND = 'UNKNOWN_COMMAND',

	// Authentication errors
	AUTH_REQUIRED = 'AUTH_REQUIRED',
	AUTH_FAILED = 'AUTH_FAILED',
	AUTH_EXPIRED = 'AUTH_EXPIRED',
	PERMISSION_DENIED = 'PERMISSION_DENIED',

	// Project/Configuration errors
	PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
	PROJECT_INVALID = 'PROJECT_INVALID',
	CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
	CONFIG_INVALID = 'CONFIG_INVALID',

	// Resource errors
	RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
	RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
	RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',

	// Organization/Region errors
	ORG_REQUIRED = 'ORG_REQUIRED',
	ORG_NOT_FOUND = 'ORG_NOT_FOUND',
	REGION_REQUIRED = 'REGION_REQUIRED',
	REGION_NOT_FOUND = 'REGION_NOT_FOUND',
	NO_REGIONS_AVAILABLE = 'NO_REGIONS_AVAILABLE',

	// Network/API errors
	NETWORK_ERROR = 'NETWORK_ERROR',
	API_ERROR = 'API_ERROR',
	TIMEOUT = 'TIMEOUT',

	// File system errors
	FILE_NOT_FOUND = 'FILE_NOT_FOUND',
	FILE_READ_ERROR = 'FILE_READ_ERROR',
	FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
	DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',

	// Runtime errors
	RUNTIME_ERROR = 'RUNTIME_ERROR',
	INTERNAL_ERROR = 'INTERNAL_ERROR',
	NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',

	// User cancellation
	USER_CANCELLED = 'USER_CANCELLED',

	// Build failed error
	BUILD_FAILED = 'BUILD_FAILED',

	// Integration errors
	INTEGRATION_FAILED = 'INTEGRATION_FAILED',

	// Security errors
	MALWARE_DETECTED = 'MALWARE_DETECTED',

	// Upgrade of the software is required to continue
	UPGRADE_REQUIRED = 'UPGRADE_REQUIRED',

	// Payment required - user needs to upgrade their plan
	PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
}

/**
 * Map error codes to exit codes
 */
export function getExitCode(errorCode: ErrorCode): ExitCode {
	switch (errorCode) {
		// Validation errors
		case ErrorCode.VALIDATION_FAILED:
		case ErrorCode.MISSING_ARGUMENT:
		case ErrorCode.INVALID_ARGUMENT:
		case ErrorCode.INVALID_OPTION:
		case ErrorCode.UNKNOWN_COMMAND:
		case ErrorCode.PROJECT_INVALID:
		case ErrorCode.CONFIG_INVALID:
			return ExitCode.VALIDATION_ERROR;

		// Authentication errors
		case ErrorCode.AUTH_REQUIRED:
		case ErrorCode.AUTH_FAILED:
		case ErrorCode.AUTH_EXPIRED:
			return ExitCode.AUTH_ERROR;

		// Permission errors
		case ErrorCode.PERMISSION_DENIED:
			return ExitCode.PERMISSION_ERROR;

		// Not found errors
		case ErrorCode.PROJECT_NOT_FOUND:
		case ErrorCode.CONFIG_NOT_FOUND:
		case ErrorCode.RESOURCE_NOT_FOUND:
		case ErrorCode.ORG_NOT_FOUND:
		case ErrorCode.REGION_NOT_FOUND:
		case ErrorCode.FILE_NOT_FOUND:
		case ErrorCode.DIRECTORY_NOT_FOUND:
		case ErrorCode.NO_REGIONS_AVAILABLE:
			return ExitCode.NOT_FOUND;

		// Network/API errors
		case ErrorCode.NETWORK_ERROR:
		case ErrorCode.API_ERROR:
		case ErrorCode.TIMEOUT:
			return ExitCode.NETWORK_ERROR;

		// File system errors
		case ErrorCode.FILE_READ_ERROR:
		case ErrorCode.FILE_WRITE_ERROR:
			return ExitCode.FILE_ERROR;

		// User cancellation
		case ErrorCode.USER_CANCELLED:
			return ExitCode.USER_CANCELLED;

		// Build errors
		case ErrorCode.BUILD_FAILED:
			return ExitCode.BUILD_FAILED;

		// Integration errors
		case ErrorCode.INTEGRATION_FAILED:
			return ExitCode.NETWORK_ERROR;

		// Security errors
		case ErrorCode.MALWARE_DETECTED:
			return ExitCode.SECURITY_ERROR;

		// Payment required - user needs to upgrade their plan
		case ErrorCode.PAYMENT_REQUIRED:
			return ExitCode.PAYMENT_REQUIRED;

		// Upgrade required - CLI version too old
		case ErrorCode.UPGRADE_REQUIRED:
			return ExitCode.UPGRADE_REQUIRED;

		// Resource conflicts and other errors
		case ErrorCode.RESOURCE_ALREADY_EXISTS:
		case ErrorCode.RESOURCE_CONFLICT:
		case ErrorCode.ORG_REQUIRED:
		case ErrorCode.REGION_REQUIRED:
		case ErrorCode.RUNTIME_ERROR:
		case ErrorCode.INTERNAL_ERROR:
		case ErrorCode.NOT_IMPLEMENTED:
		default:
			return ExitCode.GENERAL_ERROR;
	}
}

/**
 * Structured error information
 */
export interface StructuredError {
	code: ErrorCode;
	message: string;
	details?: Record<string, unknown>;
	suggestions?: string[];
	exitCode?: ExitCode;
}

/**
 * Format error in JSON structure
 */
export function formatErrorJSON(error: StructuredError): string {
	const exitCode = error.exitCode ?? getExitCode(error.code);
	const output: Record<string, unknown> = {
		error: {
			code: error.code,
			message: error.message,
			exitCode,
		},
	};

	if (error.details) {
		(output.error as Record<string, unknown>).details = error.details;
	}

	if (error.suggestions && error.suggestions.length > 0) {
		(output.error as Record<string, unknown>).suggestions = error.suggestions;
	}

	return JSON.stringify(output, null, 2);
}

/**
 * Format error for human-readable output
 */
export function formatErrorHuman(error: StructuredError): string {
	let output = `error: ${error.message}`;

	if (error.details && Object.keys(error.details).length > 0) {
		output += '\n\nDetails:';
		for (const [key, value] of Object.entries(error.details)) {
			output += `\n  ${key}: ${JSON.stringify(value)}`;
		}
	}

	if (error.suggestions && error.suggestions.length > 0) {
		output += '\n\nSuggestions:';
		for (const suggestion of error.suggestions) {
			output += `\n  - ${suggestion}`;
		}
	}

	return output;
}

/**
 * Exit the process with a structured error
 */
export function exitWithError(
	error: StructuredError,
	logger: Logger,
	errorFormat: 'json' | 'text' = 'text'
): never {
	if (errorFormat === 'json') {
		console.error(formatErrorJSON(error));
	} else {
		logger.error(formatErrorHuman(error));
	}
	const exitCode = error.exitCode ?? getExitCode(error.code);
	process.exit(exitCode);
}

/**
 * Create a structured error from a simple message and code
 */
export function createError(
	code: ErrorCode,
	message: string,
	details?: Record<string, unknown>,
	suggestions?: string[]
): StructuredError {
	return { code, message, details, suggestions };
}
