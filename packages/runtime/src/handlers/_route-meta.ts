/**
 * Route metadata tagging for build-time route type discovery.
 *
 * Handler wrappers (websocket, sse, stream, cron) stamp this symbol on
 * the returned middleware so the build tool can detect the route type
 * from `router.routes` without AST parsing.
 */

export const ROUTE_META = Symbol.for('agentuity:route-meta');

export interface RouteMeta {
	type: 'websocket' | 'sse' | 'stream' | 'cron';
}

/**
 * Tag a handler/middleware with route metadata.
 */
export function tagRoute<T extends (...args: any[]) => any>(handler: T, meta: RouteMeta): T {
	(handler as any)[ROUTE_META] = meta;
	return handler;
}

/**
 * Read route metadata from a handler/middleware.
 */
export function getRouteMeta(handler: unknown): RouteMeta | undefined {
	if (typeof handler === 'function') {
		return (handler as any)[ROUTE_META];
	}
	return undefined;
}
