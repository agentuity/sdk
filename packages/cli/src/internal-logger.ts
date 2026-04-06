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

const MASKED_ARG_VALUE = '***MASKED***';
const SENSITIVE_ARG_PATTERNS = [
	/^--?api[-_]?key$/i,
	/^--?token$/i,
	/^--?secret$/i,
	/^--?password$/i,
	/^--?client[-_]?secret$/i,
	/^--?auth[-_]?value$/i,
];

interface SessionMetadata {
	sessionId: string;
	bucket: number;
	pid: number;
	ppid: number;
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

function isSensitiveArgFlag(arg: string): boolean {
	return SENSITIVE_ARG_PATTERNS.some((pattern) => pattern.test(arg));
}

function sanitizeArgsForLogging(args: string[]): string[] {
	const sanitized: string[] = [];
	let maskNextValue = false;

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i]!;

		if (maskNextValue) {
			if (!arg.startsWith('-')) {
				sanitized.push(MASKED_ARG_VALUE);
				maskNextValue = false;
				continue;
			}

			sanitized.push(MASKED_ARG_VALUE);
			maskNextValue = false;
			i -= 1;
			continue;
		}

		if (!arg.startsWith('-')) {
			sanitized.push(arg);
			continue;
		}

		const equalsIndex = arg.indexOf('=');
		if (equalsIndex > 0) {
			const flag = arg.slice(0, equalsIndex);
			if (isSensitiveArgFlag(flag)) {
				sanitized.push(`${flag}=${MASKED_ARG_VALUE}`);
				continue;
			}
		}

		sanitized.push(arg);
		if (isSensitiveArgFlag(arg)) {
			maskNextValue = true;
		}
	}

	return sanitized;
}

export function sanitizeCliCommandForLogging(
	command: string,
	args: string[]
): { command: string; args: string[] } {
	const commandTokens = command ? command.split(' ') : [];

	if (
		commandTokens.length >= 5 &&
		commandTokens[0] === 'coder' &&
		commandTokens[1] === 'config' &&
		commandTokens[2] === 'set' &&
		commandTokens[3] === 'apikey'
	) {
		commandTokens[4] = MASKED_ARG_VALUE;
	}

	return {
		command: commandTokens.join(' '),
		args: sanitizeArgsForLogging(args),
	};
}

/**
 * Get the logs directory path
 */
function getLogsDir(): string {
	return join(homedir(), '.config', 'agentuity', 'logs');
}

/**
 * Calculate the current 5-minute bucket number
 * Each bucket represents a 5-minute window (300000ms)
 */
function getCurrentBucket(): number {
	return Math.floor(Date.now() / 300000);
}

/**
 * Parse bucket number from directory name
 * Directory format: {bucket}-{uuid}
 * Returns null for legacy directories (uuid-only format)
 */
function parseBucketFromDirName(dirName: string): number | null {
	const match = dirName.match(/^(\d+)-/);
	if (match?.[1]) {
		return parseInt(match[1], 10);
	}
	return null;
}

/**
 * Clean up old log directories, keeping only directories in the current bucket
 */
function cleanupOldLogs(currentBucket: number): void {
	// Skip cleanup when inheriting a parent's session ID to avoid
	// deleting the parent's session directory (race condition).
	// This applies to forked deploy processes and any subprocess
	// that inherits AGENTUITY_INTERNAL_SESSION_ID.
	if (process.env.AGENTUITY_INTERNAL_SESSION_ID) {
		return;
	}

	const logsDir = getLogsDir();
	if (!existsSync(logsDir)) {
		return;
	}

	try {
		const entries = readdirSync(logsDir, { withFileTypes: true });
		const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

		// Remove directories with bucket < currentBucket (old buckets)
		// Also remove legacy directories (no bucket prefix) for backward compatibility
		for (const dir of dirs) {
			const bucket = parseBucketFromDirName(dir);

			// Delete if:
			// 1. Legacy directory (no bucket prefix) - clean up old format
			// 2. Bucket is older than current bucket
			if (bucket === null || bucket < currentBucket) {
				const dirPath = join(logsDir, dir);
				try {
					rmSync(dirPath, { recursive: true, force: true });
				} catch (err) {
					// Ignore errors during cleanup
					console.debug(`Failed to remove old log directory ${dir}: ${err}`);
				}
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
	private bucket: number;
	private initialized = false;
	private disabled = false;

	constructor(
		private cliVersion: string,
		private cliName: string
	) {
		// Calculate current 5-minute bucket
		this.bucket = getCurrentBucket();

		// When a parent session ID is set in the environment, use it to ensure
		// all CLI invocations (parent and any subprocesses) write to the same log file.
		// This prevents race conditions where child processes delete parent's logs.
		const parentSessionId = process.env.AGENTUITY_INTERNAL_SESSION_ID;
		if (parentSessionId) {
			this.sessionId = parentSessionId;
			// Parent session ID already includes bucket prefix, use as-is for directory name
			this.sessionDir = join(getLogsDir(), parentSessionId);
		} else {
			// Generate new session ID with bucket prefix: {bucket}-{uuid}
			const uuid = randomUUID();
			this.sessionId = `${this.bucket}-${uuid}`;
			this.sessionDir = join(getLogsDir(), this.sessionId);
		}
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
			// Create logs directory (may already exist if we're a child process)
			mkdirSync(this.sessionDir, { recursive: true, mode: 0o700 });

			// Clean up old logs (directories with bucket < current bucket)
			// This is skipped for child processes to avoid deleting parent's session
			cleanupOldLogs(this.bucket);

			// When inheriting a parent's session ID, skip session.json creation
			// (parent already created it) but enable logging
			if (process.env.AGENTUITY_INTERNAL_SESSION_ID) {
				this.initialized = true;
				return;
			}

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

			const sanitizedInvocation = sanitizeCliCommandForLogging(command, args);

			// Gather session metadata
			const sessionMetadata: SessionMetadata = {
				sessionId: this.sessionId,
				bucket: this.bucket,
				pid: process.pid,
				ppid: process.ppid,
				command: sanitizedInvocation.command,
				args: sanitizedInvocation.args,
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
					formattedMessage += ` ${args.slice(argIndex).map(String).join(' ')}`;
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

			appendFileSync(this.logsFile, `${JSON.stringify(entry)}\n`);
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
	 * Update the session with detected agent name
	 */
	setDetectedAgent(agent: string): void {
		if (!this.initialized || this.disabled) return;

		try {
			// Read existing session data
			const existingData = JSON.parse(readFileSync(this.sessionFile, 'utf-8'));
			existingData.detectedAgent = agent;
			// Write updated session data
			writeFileSync(this.sessionFile, JSON.stringify(existingData, null, 2));
		} catch (err) {
			// Ignore errors - this is a best-effort update
			console.debug(`Failed to update detectedAgent in session: ${err}`);
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
 * Get all log session directories in the current time window
 * Returns directories from current bucket AND previous bucket (to handle boundary cases)
 */
export function getLogSessionsInCurrentWindow(): string[] {
	const logsDir = getLogsDir();
	if (!existsSync(logsDir)) {
		return [];
	}

	try {
		const currentBucket = getCurrentBucket();
		const previousBucket = currentBucket - 1;

		const entries = readdirSync(logsDir, { withFileTypes: true });
		const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

		// Filter to directories in current or previous bucket
		const validDirs = dirs.filter((dir) => {
			const bucket = parseBucketFromDirName(dir);
			// Include current bucket, previous bucket, and legacy directories (for backward compat)
			return bucket === currentBucket || bucket === previousBucket || bucket === null;
		});

		// Sort by bucket (descending) then by name to get most recent first
		validDirs.sort((a, b) => {
			const bucketA = parseBucketFromDirName(a) ?? 0;
			const bucketB = parseBucketFromDirName(b) ?? 0;
			if (bucketA !== bucketB) {
				return bucketB - bucketA; // Higher bucket first
			}
			return b.localeCompare(a); // Then by name descending
		});

		return validDirs.map((dir) => join(logsDir, dir));
	} catch {
		return [];
	}
}

/**
 * Get the latest log session directory (if any)
 * For backward compatibility, returns the first session in the current window
 */
export function getLatestLogSession(): string | null {
	const sessions = getLogSessionsInCurrentWindow();
	return sessions[0] ?? null;
}

/**
 * Get the logs directory path (exported for external use)
 */
export function getLogsDirPath(): string {
	return getLogsDir();
}
