import type { FetchAdapter, FetchRequest, FetchResponse } from '../adapter';

export interface MockAdapterCall {
	url: string;
	options: FetchRequest;
}

export interface MockAdapterResponse<T = unknown> {
	ok: boolean;
	data?: T;
	status?: number;
	statusText?: string;
	headers?: Record<string, string>;
	body?: unknown;
}

export interface MockAdapterConfig {
	onBefore?: (url: string, options: FetchRequest, invoke: () => Promise<void>) => Promise<void>;
	onAfter?: (response: Response, error?: Error) => Promise<void>;
}

export function createMockAdapter<T = unknown>(
	responses: MockAdapterResponse<T>[] = [],
	config?: MockAdapterConfig
): {
	adapter: FetchAdapter;
	calls: MockAdapterCall[];
	beforeCalls: MockAdapterCall[];
	afterCalls: Response[];
} {
	const calls: MockAdapterCall[] = [];
	const beforeCalls: MockAdapterCall[] = [];
	const afterCalls: Response[] = [];
	let callIndex = 0;

	const adapter: FetchAdapter = {
		invoke: async <TData>(url: string, options: FetchRequest) => {
			const executeInvoke = async () => {
				calls.push({ url, options });

				const mockResponse = responses[callIndex++] || { ok: true, data: undefined as TData };

				const response = new Response(
					mockResponse.body !== undefined
						? JSON.stringify(mockResponse.body)
						: mockResponse.data !== undefined
							? JSON.stringify(mockResponse.data)
							: null,
					{
						status: mockResponse.status || (mockResponse.ok ? 200 : 500),
						statusText: mockResponse.statusText || (mockResponse.ok ? 'OK' : 'Error'),
						headers: mockResponse.headers || {},
					}
				);

				if (mockResponse.ok) {
					if (config?.onAfter) {
						await config.onAfter(response);
					}
					afterCalls.push(response);
					return {
						ok: true as const,
						data: mockResponse.data as TData,
						response,
					};
				}

				const error = new Error(mockResponse.statusText || 'Error');
				if (config?.onAfter) {
					await config.onAfter(response, error);
				}
				afterCalls.push(response);
				return {
					ok: false as const,
					data: undefined as never,
					response,
				};
			};

			if (config?.onBefore) {
				beforeCalls.push({ url, options });
				let result: FetchResponse<TData> | undefined;
				await config.onBefore(url, options, async () => {
					result = await executeInvoke();
				});
				return result!;
			}

			return executeInvoke();
		},
	};

	return { adapter, calls, beforeCalls, afterCalls };
}
