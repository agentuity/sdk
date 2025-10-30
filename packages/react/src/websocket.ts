import { useContext, useEffect, useRef, useState } from 'react';
import type { InferInput, InferOutput } from '@agentuity/core';
import { AgentuityContext } from './context';
import { buildUrl } from './url';
import type { AgentName, AgentRegistry } from './types';

type onMessageHandler<T = unknown> = (data: T) => void;

interface WebsocketArgs {
	/**
	 * Optional query parameters to append to the websocket URL
	 */
	query?: URLSearchParams;
	/**
	 * Optional subpath to append to the agent path (such as /agent/:agent_name/:subpath)
	 */
	subpath?: string;
	/**
	 * Optional AbortSignal to cancel the websocket connection
	 */
	signal?: AbortSignal;
}

const serializeWSData = (
	data: unknown
): string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike> => {
	if (typeof data === 'string') {
		return data;
	}
	if (typeof data === 'object') {
		if (data instanceof ArrayBuffer || ArrayBuffer.isView(data) || data instanceof Blob) {
			return data;
		}
		return JSON.stringify(data);
	}
	throw new Error('unsupported data type for websocket: ' + typeof data);
};

const deserializeData = <T>(data: string): T => {
	if (data) {
		if (data.startsWith('{') || data.startsWith('[')) {
			try {
				return JSON.parse(data) as T;
			} catch (ex) {
				console.error('error parsing websocket data as JSON', ex, data);
			}
		}
	}
	return data as T;
};

interface WebsocketResponse<TInput, TOutput> {
	connected: boolean;
	data?: TOutput;
	send: (data: TInput) => void;
	setHandler: (handler: onMessageHandler<TOutput>) => void;
	readyState: WebSocket['readyState'];
	close: () => void;
}

export const useWebsocket = <TInput, TOutput>(
	path: string,
	options?: WebsocketArgs
): WebsocketResponse<TInput, TOutput> => {
	const context = useContext(AgentuityContext);

	if (!context) {
		throw new Error('useWebsocket must be used within a AgentuityProvider');
	}

	const manualClose = useRef(false);
	const wsRef = useRef<WebSocket | undefined>(undefined);
	const pending = useRef<TOutput[]>([]);
	const queued = useRef<TInput[]>([]);
	const [data, setData] = useState<TOutput>();
	const handler = useRef<onMessageHandler<TOutput> | undefined>(undefined);
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		if (options?.signal) {
			const listener = () => {
				wsRef.current?.close();
				wsRef.current = undefined;
				manualClose.current = true;
			};
			options.signal.addEventListener('abort', listener);
			return () => {
				options.signal?.removeEventListener('abort', listener);
			};
		}
	}, []);

	if (!wsRef.current) {
		const wsUrl = buildUrl(
			context.baseUrl!.replace(/^https?:/, 'ws:'),
			path,
			options?.subpath,
			options?.query
		);
		const connect = () => {
			wsRef.current = new WebSocket(wsUrl);
			wsRef.current.onopen = () => {
				setConnected(true);
				if (queued.current.length > 0) {
					queued.current.forEach((msg: unknown) => wsRef.current!.send(serializeWSData(msg)));
					queued.current = [];
				}
			};
			wsRef.current.onclose = () => {
				wsRef.current = undefined;
				queued.current = [];
				setConnected(false);
				if (manualClose.current) {
					return;
				}
				setTimeout(
					() => {
						connect();
					},
					Math.random() * 500 + 500
				); // jitter reconnect
			};
			wsRef.current.onmessage = (event: { data: string }) => {
				const payload = deserializeData<TOutput>(event.data);
				setData(payload);
				if (handler.current) {
					handler.current(payload);
				} else {
					pending.current.push(payload);
				}
			};
		};
		connect();
	}

	const send = (data: TInput) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(serializeWSData(data));
		} else {
			queued.current.push(data);
		}
	};

	const setHandler = (h: onMessageHandler<TOutput>) => {
		handler.current = h;
		pending.current.forEach(h);
		pending.current = [];
	};

	const close = () => {
		manualClose.current = true;
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = undefined;
		}
	};

	return {
		connected,
		close,
		data,
		send,
		setHandler,
		readyState: wsRef.current?.readyState ?? WebSocket.CLOSED,
	};
};

interface UseAgentWebsocketResponse<TInput, TOutput>
	extends Omit<WebsocketResponse<TInput, TOutput>, 'setHandler'> {
	/**
	 * Data received from the agent via WebSocket
	 */
	data?: TOutput;
}

export const useAgentWebsocket = <
	TName extends AgentName,
	TInput = TName extends keyof AgentRegistry
		? InferInput<AgentRegistry[TName]['inputSchema']>
		: never,
	TOutput = TName extends keyof AgentRegistry
		? InferOutput<AgentRegistry[TName]['outputSchema']>
		: never,
>(
	agent: AgentName,
	options?: WebsocketArgs
): UseAgentWebsocketResponse<TInput, TOutput> => {
	const [data, setData] = useState<TOutput>();
	const { connected, close, send, setHandler, readyState } = useWebsocket<TInput, TOutput>(
		`/agent/${agent}`,
		options
	);

	useEffect(() => {
		setHandler(setData);
	}, []);

	return {
		connected,
		close,
		data,
		send,
		readyState,
	};
};
