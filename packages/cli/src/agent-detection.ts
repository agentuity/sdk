import { dlopen, FFIType, ptr } from 'bun:ffi';
import { readFileSync } from 'node:fs';

/**
 * Map of process names to internal agent short names.
 * The key is the process name (or substring) that appears in the parent process path or command line.
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
	['pi', 'pi'],
	// TODO: VSCode Agent Mode detection - need to find a reliable way to detect
	// when VSCode's built-in agent (Copilot Chat) is running commands vs just
	// running in VSCode's integrated terminal. May need env var detection.
];

export type KnownAgent = (typeof KNOWN_AGENTS)[number][1];

/**
 * Display names for known agents (human-friendly names)
 */
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
	opencode: 'Open Code',
	codex: 'OpenAI Codex',
	cursor: 'Cursor',
	'claude-code': 'Claude Code',
	copilot: 'GitHub Copilot',
	gemini: 'Gemini',
	cline: 'Cline',
	roo: 'Roo Code',
	windsurf: 'Windsurf',
	zed: 'Zed',
	amp: 'Amp',
	warp: 'Warp',
	pi: 'Pi',
};

/**
 * Get the display name for an agent ID
 */
export function getAgentDisplayName(agentId: string): string {
	return AGENT_DISPLAY_NAMES[agentId] || agentId;
}

// ============================================================================
// FFI-based Fast Process Path Resolution
// ============================================================================

const PATH_MAX = 4096; // Linux PATH_MAX, also sufficient for macOS
const ARG_MAX = 65536; // Maximum command line length

/**
 * Type for the FFI function that gets a process path
 */
type GetProcessPath = (pid: number) => string | null;

/**
 * Type for the FFI function that gets a parent PID
 */
type GetParentPid = (pid: number) => number | null;

/**
 * Type for the FFI function that gets command line arguments
 */
type GetProcessCmdline = (pid: number) => string | null;

interface FFIFunctions {
	getProcessPath: GetProcessPath;
	getParentPid: GetParentPid;
	getProcessCmdline: GetProcessCmdline;
}

/**
 * Stub FFI functions for unsupported platforms or when FFI fails to load.
 */
const unsupportedFFI: FFIFunctions = {
	getProcessPath: () => null,
	getParentPid: () => null,
	getProcessCmdline: () => null,
};

/**
 * Initialize FFI functions for the current platform.
 * Returns null functions for unsupported platforms or if FFI initialization fails.
 */
function initFFI(): FFIFunctions {
	try {
		if (process.platform === 'darwin') {
			return initDarwinFFI();
		} else if (process.platform === 'linux') {
			return initLinuxFFI();
		}
	} catch (err) {
		// FFI initialization failed (e.g., missing libc on musl/Alpine, dlopen error)
		// Fall back to unsupported stub - agent detection will be skipped
		if (process.env.AGENTUITY_DEBUG_AGENT_DETECTION === '1') {
			console.error(
				'[agent-detection] FFI initialization failed:',
				err instanceof Error ? err.message : err
			);
		}
		return unsupportedFFI;
	}
	// Unsupported platform (Windows, etc.)
	return unsupportedFFI;
}

/**
 * Initialize macOS FFI functions using libSystem.dylib
 *
 * NOTE: Shared mutable buffers (pathBuf, argBuf, kinfoBuffer) are safe only in
 * single-threaded use. Detection is synchronous and single-threaded, but any
 * future concurrent usage would corrupt these buffers.
 */
function initDarwinFFI(): FFIFunctions {
	// Shared buffers - reused across calls (single-threaded assumption)
	const pathBuf = new Uint8Array(PATH_MAX);
	const argBuf = new Uint8Array(ARG_MAX);

	// Size of kinfo_proc struct on macOS (arm64 and x86_64)
	const KINFO_PROC_SIZE = 648;
	const kinfoBuffer = new Uint8Array(KINFO_PROC_SIZE);

	// Load libSystem for proc_pidpath and sysctl
	const lib = dlopen('libSystem.dylib', {
		proc_pidpath: {
			args: [FFIType.i32, FFIType.ptr, FFIType.u32],
			returns: FFIType.i32,
		},
		sysctl: {
			args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u64],
			returns: FFIType.i32,
		},
	});

	const getProcessPath: GetProcessPath = (pid: number) => {
		if (pid <= 0) return null;
		try {
			const len = lib.symbols.proc_pidpath(pid, ptr(pathBuf), PATH_MAX);
			if (len > 0) {
				return new TextDecoder().decode(pathBuf.subarray(0, len)).replace(/\0.*/, '');
			}
		} catch {
			// Ignore errors (process may have died, permission denied, etc.)
		}
		return null;
	};

	// Get parent PID using sysctl KERN_PROC_PID
	// CTL_KERN = 1, KERN_PROC = 14, KERN_PROC_PID = 1
	const getParentPid: GetParentPid = (pid: number) => {
		if (pid <= 1) return null;
		try {
			const mib = new Int32Array([1, 14, 1, pid]);
			const sizePtr = new BigUint64Array([BigInt(KINFO_PROC_SIZE)]);

			const result = lib.symbols.sysctl(ptr(mib), 4, ptr(kinfoBuffer), ptr(sizePtr), null, 0);
			if (result === 0) {
				// e_ppid offset in kinfo_proc on macOS arm64/x86_64:
				// kp_eproc starts at 296, e_ppid is at offset 264 within kp_eproc
				// Total offset: 560
				const view = new DataView(kinfoBuffer.buffer);
				const ppid = view.getInt32(560, true); // little-endian
				return ppid > 1 ? ppid : null;
			}
		} catch {
			// Ignore errors
		}
		return null;
	};

	// Get command line using sysctl KERN_PROCARGS2
	// CTL_KERN = 1, KERN_PROCARGS2 = 49
	const getProcessCmdline: GetProcessCmdline = (pid: number) => {
		if (pid <= 0) return null;
		try {
			// MIB for KERN_PROCARGS2: [CTL_KERN, KERN_PROCARGS2, pid]
			const mib = new Int32Array([1, 49, pid]);
			const sizePtr = new BigUint64Array([BigInt(ARG_MAX)]);

			const result = lib.symbols.sysctl(ptr(mib), 3, ptr(argBuf), ptr(sizePtr), null, 0);

			if (result === 0) {
				const size = Number(sizePtr[0]);
				if (size > 0) {
					// KERN_PROCARGS2 format:
					// - 4 bytes: argc (number of arguments)
					// - exec_path\0
					// - padding (zeros until aligned)
					// - arg0\0arg1\0arg2\0...
					// We want to extract exactly argc args (not env vars that follow)
					const data = argBuf.subarray(0, size);

					// Read argc (first 4 bytes, little-endian)
					const argc = new DataView(data.buffer, data.byteOffset).getInt32(0, true);
					let offset = 4;

					// Skip exec_path (find first null)
					while (offset < size && data[offset] !== 0) offset++;
					offset++; // Skip the null

					// Skip padding (multiple nulls)
					while (offset < size && data[offset] === 0) offset++;

					// Now we're at the arguments - collect exactly argc args
					const args: string[] = [];
					let start = offset;
					for (let i = offset; i < size; i++) {
						if (data[i] === 0) {
							if (i > start) {
								args.push(new TextDecoder().decode(data.subarray(start, i)));
							}
							start = i + 1;
							// Stop after collecting argc args
							if (args.length >= argc) break;
						}
					}

					return args.join(' ');
				}
			}
		} catch {
			// Ignore errors
		}
		return null;
	};

	return { getProcessPath, getParentPid, getProcessCmdline };
}

/**
 * Initialize Linux FFI functions using libc.so.6
 */
function initLinuxFFI(): FFIFunctions {
	const pathBuf = new Uint8Array(PATH_MAX);

	const lib = dlopen('libc.so.6', {
		readlink: {
			args: [FFIType.cstring, FFIType.ptr, FFIType.u64],
			returns: FFIType.i64,
		},
	});

	const getProcessPath: GetProcessPath = (pid: number) => {
		if (pid <= 0) return null;
		try {
			const procPath = Buffer.from(`/proc/${pid}/exe\0`);
			const len = Number(lib.symbols.readlink(ptr(procPath), ptr(pathBuf), PATH_MAX));
			if (len > 0) {
				return new TextDecoder().decode(pathBuf.subarray(0, len));
			}
		} catch {
			// Ignore errors (process may have died, permission denied, etc.)
		}
		return null;
	};

	const getParentPid: GetParentPid = (pid: number) => {
		if (pid <= 1) return null;
		try {
			// Read /proc/{pid}/stat to get parent PID (4th field)
			const statPath = `/proc/${pid}/stat`;
			const content = readFileSync(statPath, 'utf-8');
			// Format: pid (comm) state ppid ...
			// Need to handle comm with spaces/parens: find last ')' then parse
			const lastParen = content.lastIndexOf(')');
			if (lastParen === -1) return null;
			const rest = content.slice(lastParen + 2); // Skip ') '
			const fields = rest.split(' ');
			const ppidField = fields[1]; // ppid is 2nd field after state
			if (!ppidField) return null;
			const ppid = parseInt(ppidField, 10);
			return isNaN(ppid) || ppid <= 1 ? null : ppid;
		} catch {
			// Ignore errors
		}
		return null;
	};

	// Read command line from /proc/{pid}/cmdline (null-separated args)
	const getProcessCmdline: GetProcessCmdline = (pid: number) => {
		if (pid <= 0) return null;
		try {
			const cmdlinePath = `/proc/${pid}/cmdline`;
			const content = readFileSync(cmdlinePath);
			if (content.length > 0) {
				// Replace null bytes with spaces to get full command line
				return new TextDecoder().decode(content).replace(/\0/g, ' ').trim();
			}
		} catch {
			// Ignore errors
		}
		return null;
	};

	return { getProcessPath, getParentPid, getProcessCmdline };
}

// Initialize FFI functions lazily
let ffi: FFIFunctions | null = null;

function getFFI(): FFIFunctions {
	if (!ffi) {
		ffi = initFFI();
	}
	return ffi;
}

// ============================================================================
// Agent Detection Logic
// ============================================================================

/**
 * Cached detection result (null = not yet run, undefined = no agent detected)
 */
let cachedResult: string | undefined | null = null;

/**
 * Check if a basename matches a known agent process name.
 * Short tokens (≤2 chars) require an exact match to avoid false positives
 * (e.g., 'pi' matching 'pip', 'spin'). Longer tokens use substring matching.
 */
function matchesProcessName(basename: string, processName: string): boolean {
	if (processName.length <= 2) {
		return basename === processName;
	}
	return basename.includes(processName);
}

/**
 * Check if a path's basename matches any known agent
 */
function matchAgentPath(path: string): string | undefined {
	// Extract basename from path
	const basename = path.split(/[/\\]/).pop()?.toLowerCase() ?? '';
	for (const [processName, agentName] of KNOWN_AGENTS) {
		if (matchesProcessName(basename, processName)) {
			return agentName;
		}
	}
	return undefined;
}

/**
 * Check if a cmdline matches any known agent.
 * Only checks argv[0] and arguments that look like executable paths,
 * NOT environment variables or arbitrary path strings.
 */
function matchAgentCmdline(cmdline: string): string | undefined {
	// Split cmdline into arguments (null-separated on macOS/Linux, but we get space-separated here)
	// The cmdline format from our FFI is: "cmd arg1 arg2 ENV1=val1 ENV2=val2..."
	// We only want to check the command and args that look like executables
	const parts = cmdline.split(/\s+/);

	for (const part of parts) {
		// Skip environment variables (contain =)
		if (part.includes('=')) {
			continue;
		}

		// Check if this looks like an executable path or command
		// - Starts with / (absolute path)
		// - Is a simple command name (no path separators, no special chars)
		const isPath = part.startsWith('/');
		const isSimpleCommand = !part.includes('/') && !part.includes('=') && part.length < 50;

		if (isPath || isSimpleCommand) {
			const basename = part.split(/[/\\]/).pop()?.toLowerCase() ?? '';
			for (const [processName, agentName] of KNOWN_AGENTS) {
				if (matchesProcessName(basename, processName)) {
					return agentName;
				}
			}
		}
	}
	return undefined;
}

/**
 * Check if stdin is connected to a TTY (interactive terminal).
 * When humans type commands, stdin is usually a TTY.
 * When agents run commands programmatically, stdin is usually piped/closed.
 */
function isInteractiveSession(): boolean {
	return process.stdin.isTTY === true;
}

// Enable debug output with AGENTUITY_DEBUG_AGENT_DETECTION=1
const DEBUG = process.env.AGENTUITY_DEBUG_AGENT_DETECTION === '1';

function debugLog(...args: unknown[]): void {
	if (DEBUG) {
		console.error('[agent-detection]', ...args);
	}
}

/**
 * Synchronously detect the parent agent by walking up the process tree.
 * Uses FFI for fast process path and command line resolution.
 *
 * Detection strategy:
 * - If stdin is a TTY (interactive session), don't report as agent
 *   (human is typing commands, even if inside an agent's terminal)
 * - If stdin is NOT a TTY, check the process tree for known agents
 */
function detectParentAgent(): string | undefined {
	debugLog('Starting detection, PID:', process.pid, 'PPID:', process.ppid);
	debugLog('stdin.isTTY:', process.stdin.isTTY);

	// Dump relevant env vars for debugging agent detection
	if (DEBUG) {
		const relevantEnvVars = Object.entries(process.env)
			.filter(
				([key]) =>
					key.startsWith('WARP') ||
					key.startsWith('TERM') ||
					key.startsWith('AGENTUITY') ||
					key === 'SHELL' ||
					key === 'LC_TERMINAL' ||
					key === 'ITERM_SESSION_ID' ||
					key === 'VSCODE_INJECTION' ||
					key === 'CURSOR_TRACE_ID'
			)
			.map(([key, value]) => `${key}=${value}`)
			.join(', ');
		debugLog('Relevant env vars:', relevantEnvVars || '(none)');
		debugLog('WARP_AGENT_MODE:', process.env.WARP_AGENT_MODE ?? '(not set)');
	}

	// Short-circuit: if AGENTUITY_AGENT_MODE is set, use it directly
	// Use "false", "0", or "none" to explicitly disable detection
	const agentMode = process.env.AGENTUITY_AGENT_MODE;
	if (agentMode) {
		if (agentMode === 'false' || agentMode === '0' || agentMode === 'none') {
			debugLog('AGENTUITY_AGENT_MODE explicitly disabled:', agentMode);
			return undefined;
		}
		debugLog('Using AGENTUITY_AGENT_MODE:', agentMode);
		return agentMode;
	}

	// Warp terminal: detect via WARP_AGENT_MODE env var (set by Warp AI)
	// Note: Warp doesn't currently set this, but will in the future
	if (process.env.WARP_AGENT_MODE === 'true') {
		debugLog('Detected Warp AI via WARP_AGENT_MODE=true');
		return 'warp';
	}

	// If this is an interactive session (TTY), assume human is running the command
	// Note: Warp AI also runs with TTY=true, so Warp users should set
	// AGENTUITY_AGENT_MODE=warp until Warp sets WARP_AGENT_MODE=true
	if (isInteractiveSession()) {
		debugLog('Interactive session (TTY), skipping detection');
		return undefined;
	}

	// Unsupported on Windows (for now)
	if (process.platform === 'win32') {
		debugLog('Windows not supported');
		return undefined;
	}

	const { getProcessPath, getParentPid, getProcessCmdline } = getFFI();

	// Guard for no parent process (e.g., PID 1 in containers)
	const ppid = process.ppid;
	if (!ppid || ppid <= 1) {
		debugLog('No parent process (ppid:', ppid, ')');
		return undefined;
	}

	// Walk up the process tree looking for known agents
	const maxDepth = 10;
	let currentPid = ppid;

	for (let depth = 0; depth < maxDepth && currentPid > 1; depth++) {
		// Check the executable path for agent match
		const path = getProcessPath(currentPid);
		debugLog(`[${depth}] PID ${currentPid} path:`, path);

		if (path) {
			const agent = matchAgentPath(path);
			if (agent) {
				debugLog(`[${depth}] Matched agent from path:`, agent);
				return agent;
			}
		}

		// Check the command line (for agents running as node/bun scripts)
		const cmdline = getProcessCmdline(currentPid);
		debugLog(
			`[${depth}] PID ${currentPid} cmdline:`,
			cmdline?.substring(0, 200) + (cmdline && cmdline.length > 200 ? '...' : '')
		);

		if (cmdline) {
			const agent = matchAgentCmdline(cmdline);
			if (agent) {
				debugLog(`[${depth}] Matched agent from cmdline:`, agent);
				return agent;
			}
		}

		// Move up
		const parentPid = getParentPid(currentPid);
		debugLog(`[${depth}] Parent of ${currentPid}:`, parentPid);
		if (!parentPid) break;
		currentPid = parentPid;
	}

	debugLog('No agent found');
	return undefined;
}

/**
 * Get the executing agent if the CLI is being run from a known coding agent.
 * Returns the agent ID if detected, undefined otherwise.
 *
 * This function runs synchronously using FFI for fast process path resolution.
 * Results are cached after the first call.
 *
 * @example
 * ```typescript
 * const agent = getExecutingAgent();
 * if (agent) {
 *   logger.debug(`Running from agent: ${agent}`);
 * }
 * ```
 */
export function getExecutingAgent(): string | undefined {
	// Return cached result if already detected
	if (cachedResult !== null) {
		return cachedResult ?? undefined;
	}

	// Run detection and cache
	cachedResult = detectParentAgent();
	return cachedResult;
}

/**
 * Get environment variables to pass to subprocesses for agent detection.
 * This allows child processes to skip re-detection by using the cached result.
 *
 * @example
 * ```typescript
 * const proc = Bun.spawn(['bun', 'run', 'dev'], {
 *   env: { ...process.env, ...getAgentEnv() },
 * });
 * ```
 */
export function getAgentEnv(): Record<string, string> {
	const agent = getExecutingAgent();
	if (agent) {
		return { AGENTUITY_AGENT_MODE: agent };
	}
	return {};
}
