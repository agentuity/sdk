/**
 * Log Collector for clean build logs
 *
 * Provides a mechanism to collect clean, non-animated log output
 * for streaming to external services (like Pulse) while keeping
 * animated TUI output for the user's terminal.
 *
 * Usage:
 * - Set AGENTUITY_CLEAN_LOGS_FILE env var to a file path
 * - TUI components call appendLog() for final state messages
 * - Logs are written to the file for the parent process to read
 */

import { appendFileSync, writeFileSync } from 'node:fs';

/**
 * Get the clean logs file path from environment
 */
function getCleanLogsFile(): string | undefined {
	return process.env.AGENTUITY_CLEAN_LOGS_FILE;
}

/**
 * Check if log collection is enabled (via environment variable)
 */
export function isLogCollectionEnabled(): boolean {
	return !!getCleanLogsFile();
}

/**
 * Initialize the clean logs file (clears any existing content)
 */
export function initCleanLogsFile(filePath: string): void {
	process.env.AGENTUITY_CLEAN_LOGS_FILE = filePath;
	writeFileSync(filePath, '');
}

/**
 * Append a clean log line (no ANSI codes, no animation)
 * Only appends if collection is enabled
 */
export function appendLog(message: string): void {
	const file = getCleanLogsFile();
	if (file) {
		appendFileSync(file, message + '\n');
	}
}

/**
 * Append multiple log lines
 */
export function appendLogs(messages: string[]): void {
	const file = getCleanLogsFile();
	if (file) {
		appendFileSync(file, messages.join('\n') + '\n');
	}
}
