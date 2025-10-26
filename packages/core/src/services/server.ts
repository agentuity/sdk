import type { FetchRequest, FetchErrorResponse, FetchResponse, FetchAdapter } from './adapter';
import { fromResponse, toServiceException } from './_util';
import { ServiceException } from './exception';

interface ServiceAdapterConfig {
	headers: Record<string, string>;
	onBefore?: (url: string, options: FetchRequest, invoke: () => Promise<void>) => Promise<void>;
	onAfter?: <T>(
		url: string,
		options: FetchRequest,
		response: FetchResponse<T>,
		err?: ServiceException
	) => Promise<void>;
}

class ServerFetchAdapter implements FetchAdapter {
	#config: ServiceAdapterConfig;

	constructor(config: ServiceAdapterConfig) {
		this.#config = config;
	}
	private async _invoke<T>(url: string, options: FetchRequest): Promise<FetchResponse<T>> {
		const headers = {
			...options.headers,
			...this.#config.headers,
		};
		if (options.contentType) {
			headers['Content-Type'] = options.contentType;
		} else if (
			typeof options.body === 'string' ||
			options.body instanceof Uint8Array ||
			options.body instanceof ArrayBuffer
		) {
			headers['Content-Type'] = 'application/octet-stream';
		}
		const res = await fetch(url, {
			method: options.method ?? 'POST',
			body: options.body,
			headers,
			signal: options.signal,
			...(options.duplex ? { duplex: options.duplex } : {}),
		});
		if (res.ok) {
			// check for status codes that have no body
			switch (res.status) {
				case 100:
				case 101:
				case 102:
				case 204:
				case 304:
					return {
						ok: true,
						data: undefined as T,
						response: res,
					};
				default:
					break;
			}
			if (options?.binary) {
				return {
					ok: true,
					data: undefined as T,
					response: res,
				};
			}
			const data = await fromResponse<T>(res);
			return {
				ok: true,
				data,
				response: res,
			};
		}
		if (res.status === 404) {
			return {
				ok: false,
				response: res,
			} as FetchErrorResponse;
		}
		const err = await toServiceException(res);
		throw err;
	}
	async invoke<T>(
		url: string,
		options: FetchRequest = { method: 'POST' }
	): Promise<FetchResponse<T>> {
		if (this.#config.onBefore) {
			let result: FetchResponse<T> | undefined = undefined;
			let err: Error | undefined = undefined;
			await this.#config.onBefore(url, options, async () => {
				try {
					result = await this._invoke(url, options);
					if (this.#config.onAfter) {
						await this.#config.onAfter(url, options, result);
					}
				} catch (ex) {
					err = ex as Error;
					if (this.#config.onAfter) {
						await this.#config.onAfter(
							url,
							options,
							{
								ok: false,
								response: new Response((err as ServiceException).message ?? String(err), {
									status: (err as ServiceException).statusCode ?? 500,
								}),
							} as FetchErrorResponse,
							err as ServiceException
						);
					}
				}
			});
			if (err) {
				throw err;
			}
			return result as unknown as FetchResponse<T>;
		} else {
			return await this._invoke(url, options);
		}
	}
}

/**
 * Create a Server Side Fetch Adapter to allow the server to add headers and track outgoing requests
 *
 * @param config the service config
 * @returns
 */
export function createServerFetchAdapter(config: ServiceAdapterConfig) {
	return new ServerFetchAdapter(config);
}
