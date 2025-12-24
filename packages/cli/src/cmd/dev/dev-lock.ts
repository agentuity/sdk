/**
 * Dev Lock Manager
 *
 * Manages a lockfile to track the dev server process and its children.
 * On startup, detects and cleans up stale processes from previous sessions.
 * Ensures proper cleanup on all exit paths.
 */

import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { promises as fs } from 'node:fs';

interface LoggerLike {
	debug: (msg: string, ...args: unknown[]) => void;
	warn: (msg: string, ...args: unknown[]) => void;
	error: (msg: string, ...args: unknown[]) => void;
}

/**
 * Lockfile format for tracking dev server processes
 */
export interface DevLockFileV1 {
	version: 1;
	projectRoot: string;
	mainPid: number;
	instanceId: string;
	createdAt: string;
	updatedAt: string;
	ports: {
		bun?: number;
		vite?: number;
		gravity?: number;
	};
	children: Array<{
		pid: number;
		type: 'gravity' | 'vite' | 'other';
		description?: string;
	}>;
}

export interface DevLockManager {
	state: DevLockFileV1;
	registerChild: (info: {
		pid: number;
		type: 'gravity' | 'vite' | 'other';
		description?: string;
	}) => Promise<void>;
	updatePorts: (ports: Partial<DevLockFileV1['ports']>) => Promise<void>;
	release: () => Promise<void>;
}

function getLockPath(rootDir: string): string {
	return join(rootDir, '.agentuity', 'devserver.lock');
}

/**
 * Check if a process with the given PID exists
 */
function pidExists(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ESRCH' || error.code === 'EINVAL') return false;
		// EPERM means it exists but we can't signal it
		return error.code === 'EPERM';
	}
}

/**
 * Kill a process by PID with SIGTERM, then SIGKILL if still alive
 */
async function killPid(pid: number, logger: LoggerLike): Promise<void> {
	if (!pidExists(pid)) return;

	try {
		process.kill(pid, 'SIGTERM');
		logger.debug('Sent SIGTERM to pid %d', pid);
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ESRCH') return;
		logger.debug('Error sending SIGTERM to pid %d: %s', pid, error.message);
	}

	// Give it a moment to exit gracefully
	await new Promise((r) => setTimeout(r, 500));

	if (!pidExists(pid)) return;

	// Force kill
	try {
		process.kill(pid, 'SIGKILL');
		logger.debug('Sent SIGKILL to pid %d', pid);
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code !== 'ESRCH') {
			logger.debug('Error sending SIGKILL to pid %d: %s', pid, error.message);
		}
	}

	// Wait for process to fully terminate
	await new Promise((r) => setTimeout(r, 100));
}

/**
 * Read an existing lockfile (if any)
 */
async function readLock(lockPath: string, logger: LoggerLike): Promise<DevLockFileV1 | null> {
	if (!existsSync(lockPath)) return null;
	try {
		const raw = await fs.readFile(lockPath, 'utf8');
		const parsed = JSON.parse(raw);
		if (parsed && parsed.version === 1) return parsed as DevLockFileV1;
	} catch (err) {
		logger.warn('Failed to read/parse devserver.lock: %s', err);
	}
	return null;
}

/**
 * Remove lockfile if it exists
 */
async function removeLock(lockPath: string, logger: LoggerLike): Promise<void> {
	try {
		await fs.unlink(lockPath);
		logger.debug('Removed devserver.lock');
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code !== 'ENOENT') {
			logger.debug('Failed to remove devserver.lock: %s', error.message);
		}
	}
}

/**
 * Check if a port is in use by attempting to connect to it.
 * Uses GET instead of HEAD since some servers return 405 for HEAD requests.
 * Any response (including errors like 404, 500) means the port is in use.
 */
async function isPortResponding(port: number): Promise<boolean> {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/`, {
			method: 'GET',
			signal: AbortSignal.timeout(500),
		});
		// Consume body to avoid memory leaks
		await response.text().catch(() => {});
		return true;
	} catch (err: unknown) {
		// Connection refused (ECONNREFUSED) means nothing is listening
		// Other errors (timeout, reset) might indicate a busy port
		const error = err as Error & { cause?: { code?: string } };
		const code = error.cause?.code;
		if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
			return false;
		}
		// For other errors (like timeout), assume port might be in use but unresponsive
		return false;
	}
}

/**
 * Kill processes referenced by a stale lock, then remove the lock
 */
async function cleanupStaleLock(
	rootDir: string,
	lock: DevLockFileV1,
	logger: LoggerLike
): Promise<void> {
	const lockPath = getLockPath(rootDir);
	logger.debug(
		'Cleaning up stale devserver.lock (pid=%d, instance=%s)',
		lock.mainPid,
		lock.instanceId
	);

	// Collect all PIDs to kill (children first, then main)
	const childPids: number[] = [];
	for (const child of lock.children ?? []) {
		if (child.pid && child.pid !== lock.mainPid && child.pid !== process.pid) {
			childPids.push(child.pid);
		}
	}

	// Kill children first
	for (const pid of childPids) {
		await killPid(pid, logger);
	}

	// Kill main process if it's not us
	if (lock.mainPid !== process.pid) {
		await killPid(lock.mainPid, logger);
	}

	// Remove the stale lockfile
	await removeLock(lockPath, logger);
}

/**
 * Ensure there is no conflicting dev server for this project
 * Always cleans up any existing lock and kills associated processes
 */
async function ensureNoActiveDevForProject(
	rootDir: string,
	port: number,
	logger: LoggerLike
): Promise<void> {
	const lockPath = getLockPath(rootDir);
	const existing = await readLock(lockPath, logger);
	if (!existing) return;

	const now = Date.now();
	const createdAt = Date.parse(existing.createdAt || '');
	const ageMs = isFinite(createdAt) ? now - createdAt : Infinity;

	const mainAlive = pidExists(existing.mainPid);

	// Check if the recorded Bun port is still responding
	let bunPortInUse = false;
	if (existing.ports?.bun) {
		bunPortInUse = await isPortResponding(existing.ports.bun);
	}

	logger.debug(
		'Found existing lock (pid=%d, mainAlive=%s, bunPortInUse=%s, age=%dms) - cleaning up',
		existing.mainPid,
		mainAlive,
		bunPortInUse,
		ageMs
	);

	await cleanupStaleLock(rootDir, existing, logger);
}

/**
 * Initialize a new lock for the current dev run
 * This should be called after ensureNoActiveDevForProject has possibly cleaned stale state
 */
async function initDevLock(
	rootDir: string,
	port: number,
	logger: LoggerLike
): Promise<DevLockManager> {
	const lockPath = getLockPath(rootDir);
	await fs.mkdir(dirname(lockPath), { recursive: true });

	const state: DevLockFileV1 = {
		version: 1,
		projectRoot: rootDir,
		mainPid: process.pid,
		instanceId: randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		ports: { bun: port },
		children: [],
	};

	const writeLock = async () => {
		state.updatedAt = new Date().toISOString();
		await fs.writeFile(lockPath, JSON.stringify(state, null, 2), { encoding: 'utf8' });
	};

	await writeLock();
	logger.debug('Created devserver.lock (pid=%d, instance=%s)', state.mainPid, state.instanceId);

	const manager: DevLockManager = {
		state,

		async registerChild(child) {
			if (!child.pid) return;
			// Avoid duplicates
			if (state.children.some((c) => c.pid === child.pid)) return;
			state.children.push(child);
			await writeLock();
			logger.debug('Registered child process (pid=%d, type=%s)', child.pid, child.type);
		},

		async updatePorts(ports) {
			state.ports = { ...state.ports, ...ports };
			await writeLock();
		},

		async release() {
			await removeLock(lockPath, logger);
		},
	};

	return manager;
}

/**
 * Main entry point for dev lock management
 * Call this early in the dev command to:
 * 1. Clean up any stale processes from previous sessions
 * 2. Create a new lockfile for this session
 */
export async function prepareDevLock(
	rootDir: string,
	port: number,
	logger: LoggerLike
): Promise<DevLockManager> {
	await ensureNoActiveDevForProject(rootDir, port, logger);
	return initDevLock(rootDir, port, logger);
}

/**
 * Utility to kill all processes in a lockfile by path
 * Useful for emergency cleanup without creating a new lock
 */
export async function cleanupLockfile(rootDir: string, logger: LoggerLike): Promise<void> {
	const lockPath = getLockPath(rootDir);
	const existing = await readLock(lockPath, logger);
	if (existing) {
		await cleanupStaleLock(rootDir, existing, logger);
	}
}

/**
 * Synchronous lockfile removal for use in process.on('exit') handlers
 * Does not kill processes - just removes the file
 */
export function releaseLockSync(rootDir: string): void {
	const lockPath = getLockPath(rootDir);
	try {
		unlinkSync(lockPath);
	} catch {
		// Ignore errors - file may already be gone
	}
}
