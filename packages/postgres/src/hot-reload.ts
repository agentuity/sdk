import type { PoolConfig } from './types.ts';

const SHARED_POOL_CACHE_KEY = Symbol.for('@agentuity/postgres:shared-pools');

let hotReloadEnabledOverride: boolean | undefined;

interface HotReloadConnection {
	readonly shuttingDown: boolean;
	readonly ended?: boolean;
	close(): Promise<void>;
}

/**
 * Whether Bun hot module replacement is active.
 * Undefined in production; Bun dead-code-eliminates callers when false.
 */
export function isHotReloadEnabled(): boolean {
	if (hotReloadEnabledOverride !== undefined) {
		return hotReloadEnabledOverride;
	}
	return typeof import.meta !== 'undefined' && import.meta.hot !== undefined;
}

/** @internal Test-only override for hot reload detection. */
export function __setHotReloadEnabledForTests(value: boolean | undefined): void {
	hotReloadEnabledOverride = value;
}

function getSharedPoolCache(): Map<string, HotReloadConnection> {
	const global = globalThis as Record<symbol, Map<string, HotReloadConnection>>;
	if (!global[SHARED_POOL_CACHE_KEY]) {
		global[SHARED_POOL_CACHE_KEY] = new Map();
	}
	return global[SHARED_POOL_CACHE_KEY];
}

function normalizePoolConfig(config?: string | PoolConfig): PoolConfig {
	if (typeof config === 'string') {
		return { connectionString: config };
	}
	return {
		...config,
		connectionString: config?.connectionString ?? process.env.DATABASE_URL,
	};
}

/**
 * Stable cache key for pools that target the same backend with the same sizing.
 */
export function computePoolHotReloadKey(config?: string | PoolConfig): string {
	const normalized = normalizePoolConfig(config);
	const connectionString = normalized.connectionString ?? '';
	const max = normalized.max ?? 10;
	const maxLifetimeSeconds = normalized.maxLifetimeSeconds ?? '';
	const connectionTimeoutMillis = normalized.connectionTimeoutMillis ?? '';
	return `${connectionString}\0${max}\0${maxLifetimeSeconds}\0${connectionTimeoutMillis}`;
}

function isConnectionEnded(connection: HotReloadConnection): boolean {
	return connection.ended === true || connection.shuttingDown;
}

/**
 * Close a superseded pool/client during hot reload and track the replacement.
 * @internal
 */
export function supersedeHotReloadConnection(
	connection: HotReloadConnection,
	hotReloadKey: string
): void {
	const cache = getSharedPoolCache();
	const existing = cache.get(hotReloadKey);
	if (existing && existing !== connection && !isConnectionEnded(existing)) {
		void existing.close().catch(() => {});
	}
	cache.set(hotReloadKey, connection);
}

/**
 * Remove a closed connection from the shared hot-reload cache.
 * @internal
 */
export function removeHotReloadCachedConnection(connection: HotReloadConnection): void {
	const cache = getSharedPoolCache();
	for (const [key, cached] of cache.entries()) {
		if (cached === connection) {
			cache.delete(key);
		}
	}
}

/** Clear all shared hot-reload pool references. */
export function clearSharedHotReloadCache(): void {
	getSharedPoolCache().clear();
}

/** @internal Clear shared pool cache between tests. */
export function __clearHotReloadCacheForTests(): void {
	clearSharedHotReloadCache();
}

/**
 * Returns a shared pool cached from a prior hot reload, if still open.
 * @internal
 */
export function getSharedHotReloadPool(hotReloadKey: string): HotReloadConnection | undefined {
	const cached = getSharedPoolCache().get(hotReloadKey);
	if (cached && !isConnectionEnded(cached)) {
		return cached;
	}
	return undefined;
}
