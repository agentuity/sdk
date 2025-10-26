import type { FetchRequest, FetchErrorResponse, FetchResponse, FetchAdapter } from './adapter';
import { fromResponse, toServiceException } from './_util';
import { ServiceException } from './exception';

interface ServiceAdapterConfig {
	headers: Record<string, string>;
	onBefore?: (url: string, options: FetchRequest, invoke: () => Promise<void>) => Promise<void>;
	onAfter?: (response: Response, err?: ServiceException) => Promise<void>;
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
			'Content-Type': options.contentType ?? 'application/octet-stream',
		};
		const res = await fetch(url, {
			method: options.method ?? 'POST',
			body: options.body,
			headers,
			signal: options.signal,
		});
		if (res.ok) {
			if (this.#config.onAfter) {
				await this.#config.onAfter(res);
			}
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
		if (this.#config.onAfter) {
			await this.#config.onAfter(res, err);
		}
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
				} catch (ex) {
					err = ex as Error;
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
