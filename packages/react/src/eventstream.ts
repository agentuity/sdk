import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { InferOutput } from '@agentuity/core';
import { AgentuityContext } from './context';
import { buildUrl } from './url';
import type { AgentName, AgentRegistry } from './types';
import { deserializeData } from './serialization';
import { createReconnectManager } from './reconnect';

type onMessageHandler<T = unknown> = (data: T) => void;

interface EventStreamArgs {
	/**
	 * Optional query parameters to append to the EventStream URL
	 */
	query?: URLSearchParams;
	/**
	 * Optional subpath to append to the agent path (such as /agent/:agent_name/:subpath)
	 */
	subpath?: string;
	/**
	 * Optional AbortSignal to cancel the EventStream connection
	 */
	signal?: AbortSignal;
}

interface EventStreamResponse<TOutput> {
	connected: boolean;
	data?: TOutput;
	error: Error | null;
	setHandler: (handler: onMessageHandler<TOutput>) => void;
	readyState: number;
	close: () => void;
	reset: () => void;
}

export const useEventStream = <TOutput>(
	path: string,
	options?: EventStreamArgs
): EventStreamResponse<TOutput> => {
	const context = useContext(AgentuityContext);

	if (!context) {
		throw new Error('useEventStream must be used within a AgentuityProvider');
	}

	const manualClose = useRef(false);
	const esRef = useRef<EventSource | undefined>(undefined);
	const pending = useRef<TOutput[]>([]);
	const handler = useRef<onMessageHandler<TOutput> | undefined>(undefined);
	const reconnectManagerRef = useRef<ReturnType<typeof createReconnectManager> | undefined>(
		undefined
	);

	const [data, setData] = useState<TOutput>();
	const [error, setError] = useState<Error | null>(null);
	const [connected, setConnected] = useState(false);

	const esUrl = useMemo(
		() => buildUrl(context.baseUrl!, path, options?.subpath, options?.query),
		[context.baseUrl, path, options?.subpath, options?.query?.toString()]
	);

	const connect = useCallback(() => {
		if (manualClose.current) return;

		esRef.current = new EventSource(esUrl);
		let firstMessageReceived = false;

		esRef.current.onopen = () => {
			reconnectManagerRef.current?.recordSuccess();
			setConnected(true);
			setError(null);
		};

		esRef.current.onerror = () => {
			setError(new Error('EventStream error'));
			setConnected(false);

			if (manualClose.current) {
				return;
			}

			const result = reconnectManagerRef.current?.recordFailure();
			if (result?.scheduled) {
				const es = esRef.current;
				if (es) {
					es.onopen = null;
					es.onerror = null;
					es.onmessage = null;
					es.close();
				}
				esRef.current = undefined;
			}
		};

		esRef.current.onmessage = (event: MessageEvent) => {
			if (!firstMessageReceived) {
				reconnectManagerRef.current?.recordSuccess();
				firstMessageReceived = true;
			}
			const payload = deserializeData<TOutput>(event.data);
			setData(payload);
			if (handler.current) {
				handler.current(payload);
			} else {
				pending.current.push(payload);
			}
		};
	}, [esUrl]);

	useEffect(() => {
		reconnectManagerRef.current = createReconnectManager({
			onReconnect: connect,
			threshold: 3,
			baseDelay: 500,
			factor: 2,
			maxDelay: 30000,
			jitter: 250,
			enabled: () => !manualClose.current,
		});
		return () => reconnectManagerRef.current?.dispose();
	}, [connect]);

	const cleanup = useCallback(() => {
		manualClose.current = true;
		reconnectManagerRef.current?.dispose();
		const es = esRef.current;
		if (es) {
			es.onopen = null;
			es.onerror = null;
			es.onmessage = null;
			es.close();
		}
		esRef.current = undefined;
		handler.current = undefined;
		pending.current = [];
		setConnected(false);
	}, []);

	useEffect(() => {
		manualClose.current = false;
		connect();

		return () => {
			cleanup();
		};
	}, [connect, cleanup]);

	useEffect(() => {
		if (options?.signal) {
			const listener = () => {
				cleanup();
			};
			options.signal.addEventListener('abort', listener);
			return () => {
				options.signal?.removeEventListener('abort', listener);
			};
		}
	}, [options?.signal, cleanup]);

	const reset = () => setError(null);

	const setHandler = useCallback((h: onMessageHandler<TOutput>) => {
		handler.current = h;
		pending.current.forEach(h);
		pending.current = [];
	}, []);

	const close = () => {
		cleanup();
	};

	return {
		connected,
		close,
		data,
		error,
		setHandler,
		reset,
		readyState: esRef.current?.readyState ?? EventSource.CLOSED,
	};
};

interface UseAgentEventStreamResponse<TOutput>
	extends Omit<EventStreamResponse<TOutput>, 'setHandler'> {
	/**
	 * Data received from the agent via EventStream
	 */
	data?: TOutput;
}

export const useAgentEventStream = <
	TName extends AgentName,
	TOutput = TName extends keyof AgentRegistry
		? InferOutput<AgentRegistry[TName]['outputSchema']>
		: never,
>(
	agent: TName,
	options?: EventStreamArgs
): UseAgentEventStreamResponse<TOutput> => {
	const [data, setData] = useState<TOutput>();
	const { connected, close, setHandler, readyState, error, reset } = useEventStream<TOutput>(
		`/agent/${agent}`,
		options
	);

	useEffect(() => {
		setHandler(setData);
	}, [agent, setHandler]);

	return {
		connected,
		close,
		data,
		error,
		reset,
		readyState,
	};
};
