/**
 * Internal Logger for CLI command tracing
 *
 * This logger captures all CLI execution details for debugging purposes.
 * It maintains two files per command execution:
 * 1. session.json - Command metadata, environment, and system info
 * 2. logs.jsonl - JSON Lines format log entries
 *
 * The logger automatically cleans up old logs, keeping only the most recent execution.
 */

import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	writeFileSync,
	readFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, platform, arch, cpus, totalmem } from 'node:os';
import type { Logger, LogLevel } from '@agentuity/core';
import { randomUUID } from 'node:crypto';

// Sensitive environment variable patterns to mask
const SENSITIVE_ENV_PATTERNS = [
	/KEY/i, // Any env var with KEY in the name
	/SECRET/i,
	/TOKEN/i,
	/PASSWORD/i,
	/^AWS_/i,
	/^GCP_/i,
	/^AZURE_/i,
	/^CLOUDFLARE_/i,
	/^DATABASE_URL$/i,
	/^DB_/i,
	/^QUILL_/i, // Code signing keys
	/^MACOS_/i, // macOS signing keys
	/_P12$/i, // Certificate files
	/BEARER/i,
	/CREDENTIALS?/i,
	/AUTH/i,
];

interface SessionMetadata {
	sessionId: string;
	command: string;
	args: string[];
	timestamp: string;
	cli: {
		version: string;
		name: string;
	};
	system: {
		platform: string;
		arch: string;
		cpus: number;
		memory: number;
		bunPath: string;
		bunVersion: string;
	};
	environment: Record<string, string>;
	cwd: string;
	userId?: string;
	projectId?: string;
	orgId?: string;
}

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	context?: Record<string, unknown>;
}

/**
 * Mask sensitive values in environment variables
 */
function maskEnvironment(): Record<string, string> {
	const masked: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (!value) continue;

		// Check if this env var matches sensitive patterns
		const isSensitive = SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(key));

		if (isSensitive) {
			// Show only first and last 4 chars for keys/tokens, or just mask completely
			if (value.length > 12) {
				masked[key] = `${value.slice(0, 4)}...${value.slice(-4)}`;
			} else {
				masked[key] = '***MASKED***';
			}
		} else {
			masked[key] = value;
		}
	}
	return masked;
}

/**
 * Get the logs directory path
 */
function getLogsDir(): string {
	return join(homedir(), '.config', 'agentuity', 'logs');
}

/**
 * Clean up old log directories, keeping only the most recent one
 */
function cleanupOldLogs(currentSessionId: string): void {
	const logsDir = getLogsDir();
	if (!existsSync(logsDir)) {
		return;
	}

	try {
		const entries = readdirSync(logsDir, { withFileTypes: true });
		const dirs = entries
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.filter((name) => name !== currentSessionId);

		// Remove all directories except the current one
		for (const dir of dirs) {
			const dirPath = join(logsDir, dir);
			try {
				rmSync(dirPath, { recursive: true, force: true });
			} catch (err) {
				// Ignore errors during cleanup
				console.debug(`Failed to remove old log directory ${dir}: ${err}`);
			}
		}
	} catch (err) {
		// Ignore errors during cleanup
		console.debug(`Failed to cleanup old logs: ${err}`);
	}
}

/**
 * Internal logger for capturing all CLI command execution details
 */
export class InternalLogger implements Logger {
	private sessionId: string;
	private sessionDir: string;
	private sessionFile: string;
	private logsFile: string;
	private initialized = false;
	private disabled = false;

	constructor(
		private cliVersion: string,
		private cliName: string
	) {
		this.sessionId = randomUUID();
		this.sessionDir = join(getLogsDir(), this.sessionId);
		this.sessionFile = join(this.sessionDir, 'session.json');
		this.logsFile = join(this.sessionDir, 'logs.jsonl');
	}

	/**
	 * Initialize the internal logger with command metadata
	 * @param command - The command being executed
	 * @param args - Command line arguments
	 * @param userId - Optional user ID (set later via setUserId if not provided)
	 * @param projectDir - Optional project directory from --dir flag (defaults to process.cwd())
	 */
	init(command: string, args: string[], userId?: string, projectDir?: string): void {
		if (this.disabled) return;

		try {
			// Create logs directory
			mkdirSync(this.sessionDir, { recursive: true, mode: 0o700 });

			// Clean up old logs (keep only this session)
			cleanupOldLogs(this.sessionId);

			// Determine project directory: use provided projectDir, or fall back to cwd
			let workingDir = projectDir || process.cwd();

			// Handle home directory expansion (~/path -> /home/user/path)
			if (workingDir.startsWith('~/')) {
				workingDir = join(homedir(), workingDir.slice(2));
			}

			// Resolve to absolute path
			workingDir = resolve(workingDir);

			// Check for agentuity.json in the determined directory
			let projectId: string | undefined;
			let orgId: string | undefined;

			try {
				const agentuityJsonPath = join(workingDir, 'agentuity.json');
				if (existsSync(agentuityJsonPath)) {
					const agentuityJson = JSON.parse(readFileSync(agentuityJsonPath, 'utf-8'));
					projectId = agentuityJson.projectId;
					orgId = agentuityJson.orgId;
				}
			} catch {
				// Ignore errors reading agentuity.json
			}

			// Use workingDir as cwd in session metadata
			const cwd = workingDir;

			// Gather session metadata
			const sessionMetadata: SessionMetadata = {
				sessionId: this.sessionId,
				command,
				args,
				timestamp: new Date().toISOString(),
				cli: {
					version: this.cliVersion,
					name: this.cliName,
				},
				system: {
					platform: platform(),
					arch: arch(),
					cpus: cpus().length,
					memory: totalmem(),
					bunPath: process.execPath || '',
					bunVersion: Bun.version || process.version,
				},
				environment: maskEnvironment(),
				cwd,
				...(userId && { userId }),
				...(projectId && { projectId }),
				...(orgId && { orgId }),
			};

			// Write session metadata
			writeFileSync(this.sessionFile, JSON.stringify(sessionMetadata, null, 2));
			this.initialized = true;
		} catch (err) {
			// If we fail to initialize, disable the logger
			console.debug(`Failed to initialize internal logger: ${err}`);
			this.disabled = true;
		}
	}

	/**
	 * Write a log entry to the logs file
	 */
	private writeLog(level: LogLevel, message: unknown, args: unknown[]): void {
		if (!this.initialized || this.disabled) return;

		try {
			// Format the message
			let formattedMessage: string;
			if (typeof message === 'string') {
				// Simple sprintf-style formatting for %s and %d
				formattedMessage = message;
				let argIndex = 0;
				formattedMessage = formattedMessage.replace(/%[sd]/g, () => {
					if (argIndex < args.length) {
						return String(args[argIndex++]);
					}
					return '';
				});
				// Append any remaining args
				if (argIndex < args.length) {
					formattedMessage += ' ' + args.slice(argIndex).map(String).join(' ');
				}
			} else {
				formattedMessage = [message, ...args].map(String).join(' ');
			}

			// Strip ANSI color codes since this is going to JSON
			if (typeof Bun !== 'undefined' && typeof Bun.stripANSI === 'function') {
				formattedMessage = Bun.stripANSI(formattedMessage);
			}

			// Extract context from args (look for objects)
			const context: Record<string, unknown> = {};
			for (const arg of args) {
				if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
					Object.assign(context, arg);
				}
			}

			const entry: LogEntry = {
				timestamp: new Date().toISOString(),
				level,
				message: formattedMessage,
				...(Object.keys(context).length > 0 && { context }),
			};

			appendFileSync(this.logsFile, JSON.stringify(entry) + '\n');
		} catch (err) {
			// If write fails, disable the logger to prevent repeated errors
			console.debug(`Failed to write log entry: ${err}`);
			this.disabled = true;
		}
	}

	trace(message: unknown, ...args: unknown[]): void {
		this.writeLog('trace', message, args);
	}

	debug(message: unknown, ...args: unknown[]): void {
		this.writeLog('debug', message, args);
	}

	info(message: unknown, ...args: unknown[]): void {
		this.writeLog('info', message, args);
	}

	warn(message: unknown, ...args: unknown[]): void {
		this.writeLog('warn', message, args);
	}

	error(message: unknown, ...args: unknown[]): void {
		this.writeLog('error', message, args);
	}

	fatal(message: unknown, ...args: unknown[]): never {
		this.writeLog('error', message, args);
		process.exit(1);
	}

	child(_opts: Record<string, unknown>): Logger {
		// Return the same logger - we don't need separate child loggers for internal logging
		return this;
	}

	/**
	 * Get the session ID for this logger
	 */
	getSessionId(): string {
		return this.sessionId;
	}

	/**
	 * Get the session directory path
	 */
	getSessionDir(): string {
		return this.sessionDir;
	}

	/**
	 * Check if the logger is disabled
	 */
	isDisabled(): boolean {
		return this.disabled;
	}

	/**
	 * Update the session with user ID after authentication
	 */
	setUserId(userId: string): void {
		if (!this.initialized || this.disabled) return;

		try {
			// Read existing session data
			const existingData = JSON.parse(readFileSync(this.sessionFile, 'utf-8'));
			existingData.userId = userId;
			// Write updated session data
			writeFileSync(this.sessionFile, JSON.stringify(existingData, null, 2));
		} catch (err) {
			// Ignore errors - this is a best-effort update
			console.debug(`Failed to update userId in session: ${err}`);
		}
	}

	/**
	 * Disable the internal logger (prevents init and logging)
	 */
	disable(): void {
		this.disabled = true;
	}
}

/**
 * Create a new internal logger instance
 */
export function createInternalLogger(cliVersion: string, cliName: string): InternalLogger {
	return new InternalLogger(cliVersion, cliName);
}

/**
 * Get the latest log session directory (if any)
 */
export function getLatestLogSession(): string | null {
	const logsDir = getLogsDir();
	if (!existsSync(logsDir)) {
		return null;
	}

	try {
		const entries = readdirSync(logsDir, { withFileTypes: true });
		const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

		if (dirs.length === 0) {
			return null;
		}

		// Return the first directory (should be the only one due to cleanup)
		return join(logsDir, dirs[0]);
	} catch {
		return null;
	}
}

/**
 * Get the logs directory path (exported for external use)
 */
export function getLogsDirPath(): string {
	return getLogsDir();
}
