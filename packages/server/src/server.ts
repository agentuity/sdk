import type {
	FetchRequest,
	FetchErrorResponse,
	FetchResponse,
	FetchAdapter,
	Logger,
	HttpMethod,
} from '@agentuity/core';
import { ServiceException, toServiceException, fromResponse } from '@agentuity/core';
import { appendFileSync } from 'node:fs';

interface ServiceAdapterConfig {
	headers: Record<string, string>;
	onBefore?: (url: string, options: FetchRequest, invoke: () => Promise<void>) => Promise<void>;
	onAfter?: <T>(
		url: string,
		options: FetchRequest,
		response: FetchResponse<T>,
		err?: InstanceType<typeof ServiceException>
	) => Promise<void>;
}

/**
 * Headers that contain sensitive information and should be redacted in debug logs.
 * Includes authentication tokens, API keys, cookies, and proxy credentials.
 */
const sensitiveHeaders = new Set([
	'authorization',
	'x-api-key',
	'cookie',
	'set-cookie',
	'proxy-authorization',
]);

/**
 * Check if API debug logging is enabled and return the output destination.
 * Returns:
 * - 'console' if CI=1/true or AGENTUITY_API_DEBUG=1/true
 * - file path string if AGENTUITY_API_DEBUG is set to a path
 * - null if debug logging is disabled
 */
function getDebugOutput(): 'console' | string | null {
	const apiDebug = process.env.AGENTUITY_API_DEBUG;
	if (apiDebug) {
		// Check if it's a truthy value (console output) or a file path
		if (apiDebug === '1' || apiDebug === 'true') {
			return 'console';
		}
		// Treat any other non-empty value as a file path
		return apiDebug;
	}
	// Fall back to CI environment check
	if (process.env.CI === '1' || process.env.CI === 'true') {
		return 'console';
	}
	return null;
}

/**
 * Format request body for CI debug logging
 */
function formatRequestBody(body: unknown): string {
	if (body === undefined || body === null) {
		return '[no body]';
	}
	if (typeof body === 'string') {
		return body;
	}
	if (body instanceof Uint8Array) {
		return `[binary data: ${body.length} bytes]`;
	}
	if (body instanceof ArrayBuffer) {
		return `[binary data: ${body.byteLength} bytes]`;
	}
	if (body instanceof ReadableStream) {
		return '[stream]';
	}
	return String(body);
}

/**
 * Format a sensitive header value, preserving Bearer prefix if present.
 */
function redactSensitiveHeader(key: string, value: string): string {
	const _k = key.toLowerCase();
	// Handle Bearer tokens in authorization and proxy-authorization headers
	if ((_k === 'authorization' || _k === 'proxy-authorization') && value.startsWith('Bearer ')) {
		return `Bearer ${redact(value.substring(7))}`;
	}
	return redact(value);
}

/**
 * Format headers as a readable string for debug logging.
 * Sensitive headers (auth tokens, cookies, API keys) are redacted.
 */
function formatHeaders(headers: Headers | Record<string, string>): string {
	const entries: string[] = [];
	if (headers instanceof Headers) {
		headers.forEach((value, key) => {
			const _k = key.toLowerCase();
			if (sensitiveHeaders.has(_k)) {
				entries.push(`  ${key}: ${redactSensitiveHeader(key, value)}`);
			} else {
				entries.push(`  ${key}: ${value}`);
			}
		});
	} else {
		for (const [key, value] of Object.entries(headers)) {
			const _k = key.toLowerCase();
			if (sensitiveHeaders.has(_k)) {
				entries.push(`  ${key}: ${redactSensitiveHeader(key, value)}`);
			} else {
				entries.push(`  ${key}: ${value}`);
			}
		}
	}
	return entries.join('\n');
}

/**
 * Log detailed debug information when API requests fail.
 * Output destination is determined by AGENTUITY_API_DEBUG or CI environment variables.
 */
function logAPIDebug(
	url: string,
	method: string,
	requestHeaders: Record<string, string>,
	requestBody: unknown,
	response: Response,
	responseBody: string
): void {
	const output = getDebugOutput();
	if (!output) {
		return;
	}

	const separator = '='.repeat(60);
	const timestamp = new Date().toISOString();
	const lines = [
		'',
		separator,
		`API DEBUG: Request Failed [${timestamp}]`,
		separator,
		'',
		'>>> REQUEST',
		`URL: ${url}`,
		`Method: ${method}`,
		'Headers:',
		formatHeaders(requestHeaders),
		'Body:',
		`  ${formatRequestBody(requestBody)}`,
		'',
		'<<< RESPONSE',
		`Status: ${response.status} ${response.statusText}`,
		'Headers:',
		formatHeaders(response.headers),
		'Body:',
		`  ${responseBody || '[empty]'}`,
		'',
		separator,
		'',
	];

	const content = lines.join('\n');

	if (output === 'console') {
		console.error(content);
	} else {
		// Append to file
		try {
			appendFileSync(output, content + '\n');
		} catch {
			// If file write fails, fall back to console.error
			console.error(`[API DEBUG] Failed to write to ${output}, falling back to console`);
			console.error(content);
		}
	}
}

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
			values.push(`${_k}=${redactSensitiveHeader(k, v)}`);
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
			const data = await fromResponse<T>(res);
			return {
				ok: true,
				data,
				response: res,
			};
		}
		if (res.status === 404) {
			// Log debug info for 404 errors if debugging is enabled
			if (getDebugOutput()) {
				const responseBody = await res.clone().text();
				logAPIDebug(url, method, headers, options.body, res, responseBody);
			}
			return {
				ok: false,
				response: res,
			} as FetchErrorResponse;
		}
		// Clone response to read body for debug logging before toServiceException consumes it
		const responseBody = getDebugOutput() ? await res.clone().text() : '';
		logAPIDebug(url, method, headers, options.body, res, responseBody);
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
					if (this.#config.onAfter && err instanceof ServiceException) {
						await this.#config.onAfter(
							url,
							options,
							{
								ok: false,
								response: new Response(err.message, {
									status: err.statusCode,
								}),
							} as FetchErrorResponse,
							err
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
