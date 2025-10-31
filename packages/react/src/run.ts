import { useContext, useState } from 'react';
import type { InferInput, InferOutput } from '@agentuity/core';
import { buildUrl } from './url';
import { AgentuityContext } from './context';
import type { AgentName, AgentRegistry } from './types';

interface RunArgs {
	/**
	 * Optional query parameters to append to the URL
	 */
	query?: URLSearchParams;
	/**
	 * Optional headers to send with the request
	 */
	headers?: Record<string, string>;
	/**
	 * Optional subpath to append to the agent path (such as /agent/:agent_name/:subpath)
	 */
	subpath?: string;
	/**
	 * HTTP method to use (default: POST)
	 */
	method?: string;
	/**
	 * Optional AbortSignal to cancel the request
	 */
	signal?: AbortSignal;
}

interface UseAgentResponse<TInput, TOutput> {
	data?: TOutput;
	error: Error | null;
	run: (input: TInput, options?: RunArgs) => Promise<TOutput>;
	reset: () => void;
	running: boolean;
}

export const useAgent = <
	TName extends AgentName,
	TInput = TName extends keyof AgentRegistry
		? InferInput<AgentRegistry[TName]['inputSchema']>
		: never,
	TOutput = TName extends keyof AgentRegistry
		? InferOutput<AgentRegistry[TName]['outputSchema']>
		: never,
>(
	name: TName
): UseAgentResponse<TInput, TOutput> => {
	const context = useContext(AgentuityContext);
	const [data, setData] = useState<TOutput>();
	const [error, setError] = useState<Error | null>(null);
	const [running, setRunning] = useState(false);

	if (!context) {
		throw new Error('useAgent must be used within a AgentuityProvider');
	}

	// Reset error (for now)
	const reset = () => setError(null);

	const run = async (input: TInput, options?: RunArgs): Promise<TOutput> => {
		setRunning(true);
		setError(null);
		try {
			const url = buildUrl(context.baseUrl!, `/agent/${name}`, options?.subpath, options?.query);
			const signal = options?.signal ?? new AbortController().signal;
			const response = await fetch(url, {
				method: options?.method ?? 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(options?.headers ?? {}),
				},
				signal,
				body:
					input && typeof input === 'object' && (options?.method ?? 'POST') !== 'GET'
						? JSON.stringify(input)
						: undefined,
			});

			if (!response.ok) {
				const err = new Error(
					`Error invoking agent ${name}: ${response.status} ${response.statusText}`
				);
				setError(err);
				throw err;
			}

			// TODO: handle streams
			const ct = response.headers.get('Content-Type') || '';
			if (ct.includes('text/')) {
				const text = await response.text();
				const _data = text as TOutput;
				setData(_data);
				return _data;
			}
			if (ct.includes('/json')) {
				const json = await response.json();
				const _data = json as TOutput;
				setData(_data);
				return _data;
			}

			const err = new Error(`Unsupported content type: ${ct}`);
			setError(err);
			throw err;
		} catch (e) {
			if (e instanceof Error && e.name === 'AbortError') {
				throw e;
			}
			const err = e instanceof Error ? e : new Error(String(e));
			setError(err);
			throw err;
		} finally {
			setRunning(false);
		}
	};

	return { data, error, run, reset, running };
};
