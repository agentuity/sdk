/**
 * Server utilities for integration tests.
 * Manages test server lifecycle without orphaned processes.
 */

import { $ } from 'bun';
import { join } from 'path';

let serverProcess: ReturnType<typeof Bun.spawn> | null = null;
let serverUrl: string | null = null;
const PORT = 3500;
const STARTUP_TIMEOUT_MS = 30000;

/**
 * Start the test server and wait for it to be ready.
 * Returns the server URL.
 */
export async function startTestServer(): Promise<string> {
	if (serverProcess) {
		throw new Error('Server already started');
	}

	// Kill any existing server on the port (cleanup from previous failed tests)
	try {
		await $`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`.quiet();
		await Bun.sleep(500); // Give OS time to release port
	} catch {
		// Ignore errors if no process was running
	}

	// Construct path to built app relative to project root
	const projectRoot = process.cwd();
	const appPath = join(projectRoot, '.agentuity/app.js');

	// Start server process
	serverProcess = Bun.spawn(['bun', appPath], {
		env: {
			...process.env,
			PORT: PORT.toString(),
		},
		stdout: 'pipe',
		stderr: 'pipe',
	});

	// Wait for server to be ready by polling health endpoint
	const startTime = Date.now();
	while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
		try {
			const response = await fetch(`http://localhost:${PORT}/health`, {
				signal: AbortSignal.timeout(1000),
			});
			if (response.ok) {
				serverUrl = `http://localhost:${PORT}`;
				return serverUrl;
			}
		} catch {
			// Server not ready yet
		}
		await Bun.sleep(200);
	}

	// Timeout - kill process and fail
	if (serverProcess) {
		serverProcess.kill();
		serverProcess = null;
	}
	throw new Error(`Server failed to start within ${STARTUP_TIMEOUT_MS}ms`);
}

/**
 * Stop the test server gracefully.
 */
export async function stopTestServer(): Promise<void> {
	if (serverProcess) {
		serverProcess.kill();
		await Bun.sleep(500); // Give process time to clean up
		serverProcess = null;
		serverUrl = null;
	}

	// Final cleanup: kill any process on the port
	try {
		await $`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`.quiet();
	} catch {
		// Ignore errors
	}
}

/**
 * Get the current server URL (must call startTestServer first).
 */
export function getServerUrl(): string {
	if (!serverUrl) {
		throw new Error('Server not started. Call startTestServer() first.');
	}
	return serverUrl;
}

/**
 * Make a request to the test server.
 * Convenience wrapper around fetch.
 */
export async function request(path: string, options?: RequestInit): Promise<Response> {
	const url = `${getServerUrl()}${path}`;
	return fetch(url, options);
}

/**
 * Make a JSON POST request to the test server.
 */
export async function jsonRequest(path: string, data: unknown): Promise<Response> {
	return request(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
	});
}
