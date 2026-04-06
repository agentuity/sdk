/**
 * Type-safe globalThis declarations for Agentuity runtime.
 *
 * String-keyed globals that persist across bun --hot reloads.
 * Symbol-keyed globals are accessed via the typed helpers in _globals.ts.
 */

declare global {
	// eslint-disable-next-line no-var
	var __AGENTUITY_SERVER__:
		| {
				stop: (closeActiveConnections?: boolean) => void;
				port: number | undefined;
				pendingRequests: number;
				pendingWebSockets: number;
		  }
		| undefined;

	// eslint-disable-next-line no-var
	var __AGENTUITY_BUN_SUBPROCESS__:
		| {
				kill: (signal?: number | NodeJS.Signals) => void;
				exitCode: number | null;
		  }
		| undefined;
}

export {};
