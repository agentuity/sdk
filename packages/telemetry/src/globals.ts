/**
 * Global state for Telemetry (survives hot reloads / module re-evaluation).
 */

import type { TelemetryResponse } from './telemetry';

const telemetryInstanceKey = Symbol.for('@agentuity/telemetry:instance');
const originalConsoleKey = Symbol.for('@agentuity/telemetry:originalConsole');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export const telemetry = {
	get: (): TelemetryResponse | undefined =>
		g[telemetryInstanceKey] as TelemetryResponse | undefined,
	set: (v: TelemetryResponse): void => {
		g[telemetryInstanceKey] = v;
	},
	clear: (): void => {
		g[telemetryInstanceKey] = undefined;
	},
};

/**
 * Capture the native console once. Bun --hot re-evaluates this module while
 * `globalThis.console` may already be our patch; without a process-global
 * snapshot, `__originalConsole = Object.create(console)` chains patches and
 * stacks `[INFO]` prefixes on every reload.
 */
export function getOriginalConsole(): Console {
	const existing = g[originalConsoleKey] as Console | undefined;
	if (existing) {
		return existing;
	}
	const native = globalThis.console;
	g[originalConsoleKey] = native;
	return native;
}
