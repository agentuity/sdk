import { useCallback, useEffect, useRef, useState } from 'react';

interface ReconnectOptions {
	onReconnect: () => void;
	threshold?: number;
	baseDelay?: number;
	factor?: number;
	maxDelay?: number;
	jitter?: number;
	enabled?: () => boolean;
}

interface ReconnectManager {
	recordFailure: () => { scheduled: boolean; delay: number | null };
	recordSuccess: () => void;
	cancel: () => void;
	reset: () => void;
	dispose: () => void;
	getAttempts: () => number;
}

function createReconnectManager(opts: ReconnectOptions): ReconnectManager {
	let attempts = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const cancel = () => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const reset = () => {
		attempts = 0;
		cancel();
	};

	const recordSuccess = () => reset();

	const computeDelay = (attemptAfterThreshold: number) => {
		const base = opts.baseDelay ?? 500;
		const factor = opts.factor ?? 2;
		const max = opts.maxDelay ?? 30000;
		const jitterMax = opts.jitter ?? 250;
		const backoff = Math.min(base * Math.pow(factor, attemptAfterThreshold), max);
		const jitter = jitterMax > 0 ? Math.random() * jitterMax : 0;
		return backoff + jitter;
	};

	const recordFailure = () => {
		attempts += 1;
		const threshold = opts.threshold ?? 0;
		if (opts.enabled && !opts.enabled()) {
			return { scheduled: false, delay: null };
		}

		if (attempts - threshold >= 0) {
			const after = Math.max(0, attempts - threshold);
			const delay = computeDelay(after);
			cancel();
			timer = setTimeout(() => {
				if (opts.enabled && !opts.enabled()) return;
				opts.onReconnect();
			}, delay);
			return { scheduled: true, delay };
		}
		return { scheduled: false, delay: null };
	};

	const dispose = () => cancel();

	const getAttempts = () => attempts;

	return { recordFailure, recordSuccess, cancel, reset, dispose, getAttempts };
}

export interface UseWorkbenchWebsocketOptions {
	baseUrl?: string;
	apiKey?: string;
	onConnect?: () => void;
	onReconnect?: () => void;
	onAlive?: () => void;
	onRestarting?: () => void;
}

export interface UseWorkbenchWebsocketResult {
	connected: boolean;
	error: Error | null;
}

export function useWorkbenchWebsocket(
	options: UseWorkbenchWebsocketOptions = {}
): UseWorkbenchWebsocketResult {
	const { baseUrl, apiKey, onConnect, onReconnect, onAlive, onRestarting } = options;

	const manualClose = useRef(false);
	const wsRef = useRef<WebSocket | undefined>(undefined);
	const reconnectManagerRef = useRef<ReturnType<typeof createReconnectManager> | undefined>(
		undefined
	);
	const onConnectRef = useRef(onConnect);
	const onReconnectRef = useRef(onReconnect);
	const onAliveRef = useRef(onAlive);
	const onRestartingRef = useRef(onRestarting);
	const hasConnectedOnce = useRef(false);

	const [connected, setConnected] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Update refs when callbacks change
	useEffect(() => {
		onConnectRef.current = onConnect;
		onReconnectRef.current = onReconnect;
		onAliveRef.current = onAlive;
		onRestartingRef.current = onRestarting;
	}, [onConnect, onReconnect, onAlive, onRestarting]);

	const wsUrl = useCallback(() => {
		if (!baseUrl) return null;
		const wsBase = baseUrl.replace(/^http(s?):/, 'ws$1:');
		const url = new URL(`${wsBase}/_agentuity/workbench/ws`);
		if (apiKey) {
			url.searchParams.set('apiKey', apiKey);
		}
		return url.toString();
	}, [baseUrl, apiKey]);

	const connect = useCallback(() => {
		if (manualClose.current) return;
		const url = wsUrl();
		if (!url) return;

		wsRef.current = new WebSocket(url);

		wsRef.current.onopen = () => {
			reconnectManagerRef.current?.recordSuccess();
			setConnected(true);
			setError(null);

			// Call onConnect or onReconnect based on whether this is the first connection
			if (hasConnectedOnce.current) {
				onReconnectRef.current?.();
			} else {
				hasConnectedOnce.current = true;
				onConnectRef.current?.();
			}
		};

		wsRef.current.onerror = () => {
			setError(new Error('WebSocket error'));
		};

		wsRef.current.onclose = (evt) => {
			wsRef.current = undefined;
			setConnected(false);
			if (manualClose.current) {
				return;
			}
			if (evt.code !== 1000) {
				setError(new Error(`WebSocket closed: ${evt.code} ${evt.reason || ''}`));
			}
			reconnectManagerRef.current?.recordFailure();
		};

		wsRef.current.onmessage = (event: { data: string }) => {
			if (event.data === 'alive') {
				// Server is alive - trigger onAlive callback to refetch schemas
				onAliveRef.current?.();
			} else if (event.data === 'restarting') {
				// Server is about to restart - trigger onRestarting callback
				onRestartingRef.current?.();
			}
		};
	}, [wsUrl]);

	useEffect(() => {
		reconnectManagerRef.current = createReconnectManager({
			onReconnect: connect,
			threshold: 0,
			baseDelay: 500,
			factor: 2,
			maxDelay: 30000,
			jitter: 500,
			enabled: () => !manualClose.current && !!baseUrl,
		});
		return () => reconnectManagerRef.current?.dispose();
	}, [connect, baseUrl]);

	const cleanup = useCallback(() => {
		manualClose.current = true;
		reconnectManagerRef.current?.dispose();
		const ws = wsRef.current;
		if (ws) {
			ws.onopen = null;
			ws.onerror = null;
			ws.onclose = null;
			ws.onmessage = null;
			ws.close();
		}
		wsRef.current = undefined;
		setConnected(false);
		// Don't reset hasConnectedOnce here - we want to track if we've ever connected
	}, []);

	useEffect(() => {
		if (!baseUrl) return;

		manualClose.current = false;
		connect();

		return () => {
			cleanup();
		};
	}, [connect, cleanup, baseUrl]);

	return {
		connected,
		error,
	};
}
