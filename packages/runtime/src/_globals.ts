/**
 * Type-safe accessors for Symbol.for() global state.
 *
 * These symbols survive bun --hot reloads because globalThis persists
 * across module re-evaluations. Using Symbol.for() ensures the same
 * symbol is returned regardless of which module instance creates it.
 *
 * Each symbol key maps to a specific type — this module centralises
 * the definitions so call-sites don't need casts.
 */

import type { OtelResponse } from './otel/otel';

/** Shutdown hook function type (duplicated here to avoid circular dep with app.ts) */
type ShutdownHook = () => Promise<void> | void;

// ── Symbol keys ──────────────────────────────────────────────

const keys = {
	originalProcessExit: Symbol.for('@agentuity/runtime:original-process-exit'),
	processExitProtected: Symbol.for('@agentuity/runtime:process-exit-protected'),
	otelInstance: Symbol.for('@agentuity/runtime:otel-instance'),
	originalConsole: Symbol.for('agentuity.originalConsole'),
	serverStarted: Symbol.for('@agentuity/runtime:server-started'),
	localServicesLogged: Symbol.for('@agentuity/runtime:local-services-logged'),
	shutdownHooks: Symbol.for('@agentuity/runtime:shutdown-hooks'),
	s3Patched: Symbol.for('agentuity.s3.patched'),
} as const;

export { keys };

// ── Typed getter / setter ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export function getGlobal<T>(key: symbol): T | undefined {
	return g[key] as T | undefined;
}

export function setGlobal<T>(key: symbol, value: T): void {
	g[key] = value;
}

// ── Convenience accessors for commonly used globals ──────────

export const otel = {
	get: (): OtelResponse | undefined => getGlobal<OtelResponse>(keys.otelInstance),
	set: (v: OtelResponse) => setGlobal(keys.otelInstance, v),
};

export const originalProcessExit = {
	get: (): ((code?: number) => never) | undefined =>
		getGlobal<(code?: number) => never>(keys.originalProcessExit),
	set: (v: (code?: number) => never) => setGlobal(keys.originalProcessExit, v),
};

export const processExitProtected = {
	get: (): boolean => getGlobal<boolean>(keys.processExitProtected) ?? false,
	set: (v: boolean) => setGlobal(keys.processExitProtected, v),
};

export const originalConsole = {
	get: (): Console | undefined => getGlobal<Console>(keys.originalConsole),
	set: (v: Console) => setGlobal(keys.originalConsole, v),
};

export const serverStarted = {
	get: (): boolean => getGlobal<boolean>(keys.serverStarted) ?? false,
	set: (v: boolean) => setGlobal(keys.serverStarted, v),
};

export const localServicesLogged = {
	get: (): boolean => getGlobal<boolean>(keys.localServicesLogged) ?? false,
	set: (v: boolean) => setGlobal(keys.localServicesLogged, v),
};

export const shutdownHooks = {
	get: (): ShutdownHook[] => {
		let hooks = getGlobal<ShutdownHook[]>(keys.shutdownHooks);
		if (!hooks) {
			hooks = [];
			setGlobal(keys.shutdownHooks, hooks);
		}
		return hooks;
	},
};

export const s3Patched = {
	get: (): boolean => getGlobal<boolean>(keys.s3Patched) ?? false,
	set: (v: boolean) => setGlobal(keys.s3Patched, v),
};
