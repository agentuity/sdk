export function normalizeCoderHubHttpUrl(url: string): string {
	let normalized = url.trim().replace(/\/+$/, '');

	if (normalized.startsWith('ws://')) normalized = `http://${normalized.slice(5)}`;
	else if (normalized.startsWith('wss://')) normalized = `https://${normalized.slice(6)}`;

	normalized = normalized.replace(/\/api\/ws\b.*$/, '');
	normalized = normalized.replace(/\/ws\b.*$/, '');
	normalized = normalized.replace(/\/api\/hub\b.*$/, '');

	return normalized.replace(/\/+$/, '');
}

export function toCoderHubWsUrl(hubHttpUrl: string): string {
	let wsUrl = hubHttpUrl;
	if (wsUrl.startsWith('http://')) wsUrl = `ws://${wsUrl.slice(7)}`;
	else if (wsUrl.startsWith('https://')) wsUrl = `wss://${wsUrl.slice(8)}`;

	try {
		const parsed = new URL(wsUrl);
		if (parsed.pathname !== '/api/ws') {
			parsed.pathname = '/api/ws';
			wsUrl = parsed.toString().replace(/\/$/, '');
		}
	} catch {
		if (!wsUrl.endsWith('/api/ws')) {
			wsUrl = wsUrl.replace(/\/?$/, '/api/ws');
		}
	}

	return wsUrl;
}
