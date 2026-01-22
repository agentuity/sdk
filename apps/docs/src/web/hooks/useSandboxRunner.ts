import { useCallback, useEffect, useRef, useState } from 'react';
import type { TerminalStatus } from '../components/TerminalOutput';

/** Valid status values that the backend can send */
const VALID_STATUSES: Set<TerminalStatus> = new Set([
	'idle',
	'creating',
	'recreating',
	'running',
	'completed',
	'error',
]);

/** Decode SSE-encoded newlines and clean output for display */
function decodeAndClean(text: string): string {
	return text
		.replace(/\\n/g, '\n')
		.replace(/---OUTPUT---\n?/g, '');
}

/** Validate that a status string is a valid TerminalStatus */
function isValidStatus(status: string): status is TerminalStatus {
	return VALID_STATUSES.has(status as TerminalStatus);
}

interface SandboxRunnerState {
	status: TerminalStatus;
	output: string;
	error: string | null;
	exitCode: number | null;
}

interface UseSandboxRunnerReturn {
	/** Current state of the sandbox runner (status, output, error, exitCode) */
	state: SandboxRunnerState;
	/** Start executing a script in the sandbox */
	run: (script: string, input?: unknown) => void;
	/** Stop the current execution (preserves error state) */
	stop: () => void;
	/** Reset to initial state (clears all output) */
	reset: () => void;
}

/**
 * Hook for running scripts in a cloud sandbox with streaming output.
 *
 * Connects to the sandbox API via SSE and streams stdout/stderr to state.
 * Handles sandbox creation, recreation on failure, and connection errors.
 *
 * @example
 * ```tsx
 * const { state, run, stop, reset } = useSandboxRunner();
 *
 * // Run a script
 * run('hello', { name: 'World' });
 *
 * // Access state
 * console.log(state.status); // 'idle' | 'creating' | 'running' | 'completed' | 'error'
 * console.log(state.output); // Streamed stdout
 * ```
 */
export function useSandboxRunner(): UseSandboxRunnerReturn {
	const [state, setState] = useState<SandboxRunnerState>({
		status: 'idle',
		output: '',
		error: null,
		exitCode: null,
	});

	const eventSourceRef = useRef<EventSource | null>(null);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			eventSourceRef.current?.close();
			eventSourceRef.current = null;
		};
	}, []);

	const run = useCallback((script: string, input?: unknown) => {
		// Close any existing connection
		eventSourceRef.current?.close();
		eventSourceRef.current = null;

		setState({
			status: 'creating',
			output: '',
			error: null,
			exitCode: null,
		});

		// Use script mode - call pre-baked scripts from snapshot
		let url = `/api/sandbox/run?script=${encodeURIComponent(script)}`;

		// Add input parameter if provided
		if (input !== undefined) {
			const inputBase64 = btoa(JSON.stringify(input));
			url += `&input=${encodeURIComponent(inputBase64)}`;
		}

		const eventSource = new EventSource(url);
		eventSourceRef.current = eventSource;

		eventSource.addEventListener('status', (event) => {
			const status = event.data;
			if (isValidStatus(status)) {
				setState((prev) => ({ ...prev, status }));
			}
		});

		eventSource.addEventListener('stdout', (event) => {
			const decoded = decodeAndClean(event.data);
			setState((prev) => ({
				...prev,
				status: 'running',
				output: prev.output + decoded,
			}));
		});

		eventSource.addEventListener('done', (event) => {
			try {
				const data = JSON.parse(event.data);
				setState((prev) => ({
					...prev,
					status: 'completed',
					exitCode: data.exitCode ?? 0,
				}));
			} catch {
				setState((prev) => ({
					...prev,
					status: 'completed',
					exitCode: 0,
				}));
			}
			eventSource.close();
			eventSourceRef.current = null;
		});

		// Handle server-sent error events (from writeSSE({ event: 'error', ... }))
		eventSource.addEventListener('error', (event: Event) => {
			// SSE named events are MessageEvent when they have data
			const messageEvent = event as MessageEvent;
			if (messageEvent.data) {
				setState((prev) => ({
					...prev,
					status: 'error',
					error: messageEvent.data,
				}));
				eventSource.close();
				eventSourceRef.current = null;
			}
			// Connection errors fall through to onerror
		});

		// Handle connection errors (network issues, server down, etc.)
		eventSource.onerror = () => {
			if (eventSource.readyState === EventSource.CLOSED) {
				setState((prev) => {
					// Preserve completed or error states
					if (prev.status === 'completed' || prev.status === 'error') return prev;
					return {
						...prev,
						status: 'error',
						error: prev.error || 'Connection lost',
					};
				});
				eventSourceRef.current = null;
			}
		};
	}, []);

	const stop = useCallback(() => {
		eventSourceRef.current?.close();
		eventSourceRef.current = null;
		setState((prev) => {
			// Preserve error state
			if (prev.status === 'error') return prev;
			return {
				...prev,
				status: prev.output ? 'completed' : 'idle',
			};
		});
	}, []);

	const reset = useCallback(() => {
		eventSourceRef.current?.close();
		eventSourceRef.current = null;
		setState({
			status: 'idle',
			output: '',
			error: null,
			exitCode: null,
		});
	}, []);

	return { state, run, stop, reset };
}
