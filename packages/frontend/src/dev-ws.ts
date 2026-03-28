/**
 * Dev-mode WebSocket URL adjustments.
 *
 * In Agentuity Vite-primary dev mode, frontend runs on the user-facing port
 * while Bun backend runs on an internal port (typically +1). Vite HTTP proxying
 * works for REST, but WebSocket proxying can hit runtime incompatibilities in
 * certain environments. This helper rewrites same-origin WS URLs to the Bun
 * backend port when AGENTUITY_PORT is available.
 */

import { getProcessEnv } from './env';

export function resolveDevWebSocketUrl(url: string): string {
	try {
		if (typeof window === 'undefined') return url;

		const backendPort = getProcessEnv('AGENTUITY_PORT');
		if (!backendPort) return url;

		const parsed = new URL(url, window.location.origin);
		const isWs = parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
		if (!isWs) return url;

		// Only rewrite same-origin URLs so explicit external WS endpoints remain unchanged.
		if (parsed.hostname !== window.location.hostname) return parsed.toString();
		if (parsed.port && parsed.port !== window.location.port) return parsed.toString();

		parsed.port = backendPort;
		return parsed.toString();
	} catch {
		return url;
	}
}
