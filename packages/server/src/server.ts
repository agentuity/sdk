import type {
	FetchRequest,
	FetchErrorResponse,
	FetchResponse,
	FetchAdapter,
	Logger,
	HttpMethod,
} from '@agentuity/core';
import { ServiceException, toServiceException, fromResponse } from '@agentuity/core';

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

const sensitiveHeaders = new Set(['authorization', 'x-api-key']);

/**
 * Redacts the middle of a string while keeping a prefix and suffix visible.
 * Ensures that if the string is too short, everything is redacted.
 *
 * @param input The string to redact
 * @param prefix Number of chars to keep at the start
 * @param suffix Number of chars to keep at the end
 * @param mask  Character used for redaction
 */
export function redact(
	input: string,
	prefix: number = 4,
	suffix: number = 4,
	mask: string = '*'
): string {
	if (!input) return '';

	// If revealing prefix+suffix would leak too much, fully mask
	if (input.length <= prefix + suffix) {
		return mask.repeat(input.length);
	}

	const start = input.slice(0, prefix);
	const end = input.slice(-suffix);
	const hiddenLength = input.length - prefix - suffix;

	return start + mask.repeat(hiddenLength) + end;
}

const redactHeaders = (kv: Record<string, string>): string => {
	const values: string[] = [];
	for (const k of Object.keys(kv)) {
		const _k = k.toLowerCase();
		const v = kv[k];
		if (sensitiveHeaders.has(_k)) {
			values.push(`${_k}=${redact(v)}`);
		} else {
			values.push(`${_k}=${v}`);
		}
	}
	return '[' + values.join(',') + ']';
};

class ServerFetchAdapter implements FetchAdapter {
	#config: ServiceAdapterConfig;
	#logger: Logger;

	constructor(config: ServiceAdapterConfig, logger: Logger) {
		this.#config = config;
		this.#logger = logger;
	}
	private async _invoke<T>(url: string, options: FetchRequest): Promise<FetchResponse<T>> {
		const headers: Record<string, string> = {
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
		const method: HttpMethod = options.method ?? 'POST';
		this.#logger.trace('sending %s to %s with headers: %s', method, url, redactHeaders(headers));
		const res = await fetch(url, {
			method,
			body: options.body,
			headers,
			signal: options.signal,
			...(options.duplex ? { duplex: options.duplex } : {}),
		});
		if (res.ok) {
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
			const data = await fromResponse<T>(method, url, res);
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
		const err = await toServiceException(method, url, res);
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
export function createServerFetchAdapter(config: ServiceAdapterConfig, logger: Logger) {
	return new ServerFetchAdapter(config, logger);
}
