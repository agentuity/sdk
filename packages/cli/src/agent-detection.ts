import { spawn } from 'node:child_process';

/**
 * Map of process names to internal agent short names.
 * The key is the process name (or substring) that appears in the parent process command line.
 * The value is the internal short name used to identify the agent.
 *
 * Process names verified via `agentuity cloud sandbox run --runtime <agent>:latest`:
 * - opencode: binary 'opencode' (from bun install -g opencode-ai)
 * - codex: binary 'codex' (from npm install -g @openai/codex)
 * - cursor: binary 'cursor-agent' (from curl installer)
 * - claude-code: binary 'claude', shows as 'node /usr/local/bin/claude'
 * - copilot: binary 'copilot', shows as 'node /usr/local/bin/copilot' and spawns native binary
 * - gemini: binary 'gemini', shows as 'node /usr/local/bin/gemini'
 * - amp: binary 'amp', shows as 'node --no-warnings /usr/local/bin/amp'
 *
 * IMPORTANT: Order matters! More specific patterns should come before less specific ones.
 * For example, 'opencode' must be checked before 'code' to avoid false matches.
 */
export const KNOWN_AGENTS: [string, string][] = [
	// Verified via cloud sandbox runtime - most specific patterns first
	['opencode', 'opencode'],
	['codex', 'codex'],
	['cursor-agent', 'cursor'],
	['claude', 'claude-code'],
	['copilot', 'copilot'],
	['gemini', 'gemini'],
	['cline', 'cline'],
	['roo-code', 'roo'],
	['windsurf', 'windsurf'],
	['zed', 'zed'],
	['amp', 'amp'],
	['warp', 'warp'],
	// TODO: VSCode Agent Mode detection - need to find a reliable way to detect
	// when VSCode's built-in agent (Copilot Chat) is running commands vs just
	// running in VSCode's integrated terminal. May need env var detection.
];

export type KnownAgent = (typeof KNOWN_AGENTS)[number][1];

/**
 * Promise for the detection result (set when detection starts)
 */
let detectionPromise: Promise<string | undefined> | null = null;

/**
 * Cached result after detection completes (null = not yet resolved)
 */
let cachedResult: string | undefined | null = null;

/**
 * Callbacks to invoke when agent detection completes
 */
const detectionCallbacks: Array<(agent: string | undefined) => void> = [];

/**
 * Get the command line and parent PID for a given PID in a single ps call
 */
function getProcessInfo(pid: number): Promise<{ command: string; ppid: number } | undefined> {
	return new Promise((resolve) => {
		const ps = spawn('ps', ['-p', String(pid), '-o', 'ppid=,command='], {
			stdio: ['ignore', 'pipe', 'ignore'],
		});

		let output = '';

		ps.stdout.on('data', (data: Buffer) => {
			output += data.toString();
		});

		ps.on('close', () => {
			const trimmed = output.trim();
			if (!trimmed) {
				resolve(undefined);
				return;
			}

			// Output format: "  PPID COMMAND" (ppid is right-aligned, then space, then command)
			const match = trimmed.match(/^\s*(\d+)\s+(.+)$/);
			if (!match) {
				resolve(undefined);
				return;
			}

			const ppidStr = match[1];
			const commandStr = match[2];
			if (!ppidStr || !commandStr) {
				resolve(undefined);
				return;
			}

			const ppid = parseInt(ppidStr, 10);
			const command = commandStr.toLowerCase();

			if (isNaN(ppid) || ppid <= 1 || !command) {
				resolve(undefined);
				return;
			}

			resolve({ command, ppid });
		});

		ps.on('error', () => {
			resolve(undefined);
		});
	});
}

/**
 * Check if a command matches any known agent
 */
function matchAgent(command: string): string | undefined {
	for (const [processName, agentName] of KNOWN_AGENTS) {
		if (command.includes(processName)) {
			return agentName;
		}
	}
	return undefined;
}

/**
 * Detect the parent process command and check if it matches a known agent.
 * Walks up the process tree to find the first matching agent.
 */
function detectParentAgent(): Promise<string | undefined> {
	return new Promise((resolve) => {
		// TODO: Implement Windows support using wmic or PowerShell
		if (process.platform === 'win32') {
			resolve(undefined);
			return;
		}

		const maxDepth = 10; // Limit how far up we walk the tree

		async function walkTree(pid: number, depth: number): Promise<string | undefined> {
			if (depth >= maxDepth || pid <= 1) {
				return undefined;
			}

			// Get both command and parent PID in a single ps call
			const info = await getProcessInfo(pid);
			if (!info) {
				return undefined;
			}

			// Check if this process matches a known agent
			const agent = matchAgent(info.command);
			if (agent) {
				return agent;
			}

			// Walk up to parent
			return walkTree(info.ppid, depth + 1);
		}

		const ppid = process.ppid;
		if (!ppid) {
			resolve(undefined);
			return;
		}

		walkTree(ppid, 0)
			.then(resolve)
			.catch(() => resolve(undefined));
	});
}

/**
 * Start agent detection immediately (non-blocking).
 * Call this early in CLI startup to begin detection in the background.
 */
export function startAgentDetection(): void {
	if (detectionPromise !== null) {
		// Already started
		return;
	}

	detectionPromise = detectParentAgent().then((result) => {
		cachedResult = result;
		// Invoke all registered callbacks
		for (const callback of detectionCallbacks) {
			try {
				callback(result);
			} catch {
				// Ignore callback errors
			}
		}
		return result;
	});
}

/**
 * Register a callback to be invoked when agent detection completes.
 * If detection has already completed, the callback is invoked immediately.
 * This is non-blocking and does not return a promise.
 *
 * @example
 * ```typescript
 * onAgentDetected((agent) => {
 *   if (agent) {
 *     console.log(`Detected agent: ${agent}`);
 *   }
 * });
 * ```
 */
export function onAgentDetected(callback: (agent: string | undefined) => void): void {
	// If detection already completed, invoke immediately
	if (cachedResult !== null) {
		try {
			callback(cachedResult);
		} catch {
			// Ignore callback errors
		}
		return;
	}

	// Otherwise, register for later invocation
	detectionCallbacks.push(callback);
}

/**
 * Get the cached detection result synchronously.
 * Returns undefined if detection hasn't completed yet or no agent was detected.
 * Returns null if detection hasn't started or completed yet.
 *
 * Use this for synchronous access when you don't want to wait for detection.
 */
export function getDetectedAgent(): string | undefined | null {
	return cachedResult;
}

/**
 * Wait for agent detection to complete and ensure all callbacks have been invoked.
 * Call this before CLI exit to ensure the detected agent is written to session logs.
 *
 * This is a no-op if detection hasn't started or has already completed.
 */
export async function flushAgentDetection(): Promise<void> {
	if (detectionPromise !== null) {
		await detectionPromise;
	}
}

/**
 * Check if the CLI is being executed from a known coding agent.
 * Returns the agent name if detected, undefined otherwise.
 *
 * This function returns immediately if detection has already completed,
 * otherwise it awaits the detection promise started by startAgentDetection().
 *
 * @example
 * ```typescript
 * const agent = await isExecutingFromAgent();
 * if (agent) {
 *   logger.debug(`Running from agent: ${agent}`);
 * }
 * ```
 */
export async function isExecutingFromAgent(): Promise<string | undefined> {
	// Return cached result if detection has completed
	if (cachedResult !== null) {
		return cachedResult;
	}

	// If detection hasn't started yet, start it now
	if (detectionPromise === null) {
		startAgentDetection();
	}

	// Wait for detection to complete
	return detectionPromise!;
}
