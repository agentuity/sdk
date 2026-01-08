/**
 * API Client for Agentuity Platform
 *
 * Handles HTTP requests to the API with automatic error parsing and User-Agent headers.
 */

import { z } from 'zod';
import type { Logger } from '@agentuity/core';
import { StructuredError } from '@agentuity/core';

export interface APIClientConfig {
	skipVersionCheck?: boolean;
	userAgent?: string;
	maxRetries?: number;
	retryDelayMs?: number;
	headers?: Record<string, string>;
}

const ZodIssuesSchema = z.array(
	z.object({
		code: z.string(),
		input: z.unknown().optional(),
		path: z.array(z.union([z.string(), z.number()])),
		message: z.string(),
	})
);

export type IssuesType = z.infer<typeof ZodIssuesSchema>;

const toIssues = (issues: z.core.$ZodIssue[]): IssuesType => {
	return issues.map((issue) => ({
		code: issue.code,
		input: issue.input,
		path: issue.path.map((x) => (typeof x === 'number' ? x : String(x))),
		message: issue.message,
	}));
};

const APIErrorSchema = z.object({
	success: z.boolean(),
	code: z.string().optional(),
	message: z.string().optional(),
	error: z
		.union([
			z.string(),
			z.object({
				name: z.string().optional(),
				issues: ZodIssuesSchema.optional(),
			}),
		])
		.optional(),
	details: z.record(z.string(), z.unknown()).optional(),
});

export const APIError = StructuredError('APIErrorResponse')<{
	url: string;
	status: number;
	sessionId?: string | null;
}>();

export const ValidationInputError = StructuredError(
	'ValidationInputError',
	'There was an error validating the API input data.'
)<{
	url: string;
	issues: IssuesType;
}>();

export const ValidationOutputError = StructuredError(
	'ValidationOutputError',
	'There was an unexpected error validating the API response data.'
)<{
	url: string;
	issues: IssuesType;
	sessionId?: string | null;
}>();

export const UpgradeRequiredError = StructuredError(
	'UpgradeRequiredError',
	'Upgrade required to continue. Please see https://agentuity.dev/CLI/installation to download the latest version of the SDK.'
)<{
	sessionId?: string | null;
}>();

export const MaxRetriesError = StructuredError(
	'MaxRetriesError',
	'Max Retries attempted and continued failures exhausted.'
);

export class APIClient {
	#baseUrl: string;
	#apiKey?: string;
	#config?: APIClientConfig;
	#logger: Logger;

	constructor(baseUrl: string, logger: Logger, config?: APIClientConfig);
	constructor(baseUrl: string, logger: Logger, apiKey: string, config?: APIClientConfig);
	constructor(
		baseUrl: string,
		logger: Logger,
		apiKeyOrConfig?: string | APIClientConfig,
		config?: APIClientConfig
	) {
		this.#baseUrl = baseUrl;
		this.#logger = logger;

		// Detect if third parameter is apiKey (string) or config (object)
		if (typeof apiKeyOrConfig === 'string') {
			this.#apiKey = apiKeyOrConfig;
			this.#config = config;
		} else {
			this.#apiKey = undefined;
			this.#config = apiKeyOrConfig;
		}
		if (!this.#apiKey && process.env.AGENTUITY_SDK_KEY) {
			this.#apiKey = process.env.AGENTUITY_SDK_KEY;
		}
	}

	/**
	 * GET request
	 */
	async get<TResponse = void>(
		endpoint: string,
		responseSchema?: z.ZodType<TResponse>,
		signal?: AbortSignal
	): Promise<TResponse> {
		return this.request('GET', endpoint, responseSchema, undefined, undefined, signal);
	}

	/**
	 * POST request with optional body
	 */
	async post<TResponse = void, TBody = unknown>(
		endpoint: string,
		body?: TBody,
		responseSchema?: z.ZodType<TResponse>,
		bodySchema?: z.ZodType<TBody>,
		signal?: AbortSignal
	): Promise<TResponse> {
		return this.request('POST', endpoint, responseSchema, body, bodySchema, signal);
	}

	/**
	 * PUT request with optional body
	 */
	async put<TResponse = void, TBody = unknown>(
		endpoint: string,
		body?: TBody,
		responseSchema?: z.ZodType<TResponse>,
		bodySchema?: z.ZodType<TBody>,
		signal?: AbortSignal
	): Promise<TResponse> {
		return this.request('PUT', endpoint, responseSchema, body, bodySchema, signal);
	}

	/**
	 * DELETE request
	 */
	async delete<TResponse = void>(
		endpoint: string,
		responseSchema?: z.ZodType<TResponse>,
		signal?: AbortSignal
	): Promise<TResponse> {
		return this.request('DELETE', endpoint, responseSchema, undefined, undefined, signal);
	}

	/**
	 * PATCH request with optional body
	 */
	async patch<TResponse = void, TBody = unknown>(
		endpoint: string,
		body?: TBody,
		responseSchema?: z.ZodType<TResponse>,
		bodySchema?: z.ZodType<TBody>,
		signal?: AbortSignal
	): Promise<TResponse> {
		return this.request('PATCH', endpoint, responseSchema, body, bodySchema, signal);
	}

	/**
	 * Raw GET request that returns the Response object directly.
	 * Useful for streaming responses where you need access to the body stream.
	 */
	async rawGet(endpoint: string, signal?: AbortSignal): Promise<Response> {
		return this.#makeRequest('GET', endpoint, undefined, signal);
	}

	/**
	 * Raw POST request that returns the Response object directly.
	 * Useful for binary uploads where you need to pass raw body data.
	 */
	async rawPost(
		endpoint: string,
		body: Uint8Array | ArrayBuffer | ReadableStream<Uint8Array> | string,
		contentType: string,
		signal?: AbortSignal
	): Promise<Response> {
		return this.#makeRequest('POST', endpoint, body, signal, contentType);
	}

	/**
	 * Generic request method (prefer HTTP verb methods: get, post, put, delete, patch)
	 */
	async request<TResponse = void, TBody = unknown>(
		method: string,
		endpoint: string,
		responseSchema?: z.ZodType<TResponse>,
		body?: TBody,
		bodySchema?: z.ZodType<TBody>,
		signal?: AbortSignal
	): Promise<TResponse> {
		// Validate request body if schema provided
		if (body !== undefined && bodySchema) {
			const validationResult = bodySchema.safeParse(body);
			if (!validationResult.success) {
				throw new ValidationInputError({
					url: endpoint,
					issues: toIssues(validationResult.error.issues),
				});
			}
		}

		const response = await this.#makeRequest(method, endpoint, body, signal);

		// Handle empty responses (204 or zero-length body)
		let data: unknown;
		if (response.status === 204 || response.headers.get('content-length') === '0') {
			data = null;
		} else {
			const text = await response.text();
			if (text === '') {
				data = null;
			} else {
				const contentType = response.headers.get('content-type');
				if (contentType?.includes('application/json')) {
					data = JSON.parse(text);
				} else {
					data = text;
				}
			}
		}

		if (responseSchema) {
			// Validate response
			const validationResult = responseSchema.safeParse(data);
			if (!validationResult.success) {
				throw new ValidationOutputError({
					url: endpoint,
					issues: toIssues(validationResult.error.issues),
					sessionId: response.headers.get('x-session-id'),
				});
			}

			return validationResult.data;
		}

		return undefined as TResponse;
	}

	async #makeRequest(
		method: string,
		endpoint: string,
		body?: unknown,
		signal?: AbortSignal,
		contentType?: string
	): Promise<Response> {
		this.#logger.trace('sending %s to %s%s', method, this.#baseUrl, endpoint);

		const maxRetries = this.#config?.maxRetries ?? 3;
		const baseDelayMs = this.#config?.retryDelayMs ?? 100;

		const url = `${this.#baseUrl}${endpoint}`;
		const headers: Record<string, string> = {
			'Content-Type': contentType ?? 'application/json',
		};

		// Only set Accept header for JSON requests (not binary uploads)
		if (!contentType || contentType === 'application/json') {
			headers['Accept'] = 'application/json';
		}

		if (this.#config?.userAgent) {
			headers['User-Agent'] = this.#config.userAgent;
		}

		if (this.#apiKey) {
			headers['Authorization'] = `Bearer ${this.#apiKey}`;
		}

		if (this.#config?.headers) {
			Object.keys(this.#config.headers).forEach(
				(key) => (headers[key] = this.#config!.headers![key])
			);
		}

		const canRetry = !(body instanceof ReadableStream); // we cannot safely retry a ReadableStream as body

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				let response: Response;

				try {
					let requestBody:
						| Uint8Array
						| ArrayBuffer
						| ReadableStream<Uint8Array>
						| string
						| undefined;
					if (body !== undefined) {
						if (contentType && contentType !== 'application/json') {
							requestBody = body as
								| Uint8Array
								| ArrayBuffer
								| ReadableStream<Uint8Array>
								| string;
						} else {
							requestBody = JSON.stringify(body);
						}
					}

					response = await fetch(url, {
						method,
						headers,
						body: requestBody,
						signal,
					});
				} catch (ex) {
					this.#logger.debug('fetch returned an error trying to access: %s. %s', url, ex);
					const _ex = ex as { code?: string; name: string };
					let retryable = false;
					// Check for retryable network errors
					if (_ex.code === 'ConnectionRefused' || _ex.code === 'ECONNREFUSED') {
						retryable = true;
					} else if (_ex.name === 'TypeError' || ex instanceof TypeError) {
						// TypeError from fetch typically indicates network issues
						retryable = true;
					}
					if (retryable) {
						response = new Response(null, { status: 503 });
					} else {
						throw new APIError({
							url,
							status: 0,
							cause: ex,
						});
					}
				}

				const sessionId = response.headers.get('x-session-id');

				// Check if we should retry on specific status codes (409, 501, 503)
				const retryableStatuses = [409, 501, 503];
				if (canRetry && retryableStatuses.includes(response.status) && attempt < maxRetries) {
					let delayMs = this.#getRetryDelay(attempt, baseDelayMs);

					// For 409, check for rate limit headers
					if (response.status === 409) {
						const rateLimitDelay = this.#getRateLimitDelay(response);
						if (rateLimitDelay !== null) {
							delayMs = rateLimitDelay;
							this.#logger.debug(
								`Got 409 sending to ${url} with rate limit headers, waiting ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1}, will delay ${delayMs}ms), sessionId: ${sessionId ?? null}`
							);
						} else {
							this.#logger.debug(
								`Got 409 sending to ${url}, retrying with backoff ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1}, will delay ${delayMs}ms), sessionId: ${sessionId ?? null}`
							);
						}
					} else {
						this.#logger.debug(
							`Got ${response.status} sending to ${url}, retrying (attempt ${attempt + 1}/${maxRetries + 1}, will delay ${delayMs}ms), sessionId: ${sessionId ?? null}`
						);
					}

					await this.#sleep(delayMs);

					this.#logger.debug(`after sleep for ${url}, sessionId: ${sessionId ?? null}`);

					continue;
				}

				// Handle error responses
				if (!response.ok) {
					const responseBody = await response.text();
					const contentType = response.headers.get('content-type');

					let errorData: z.infer<typeof APIErrorSchema> | undefined;

					// Only attempt to parse as JSON if the content type indicates JSON
					const isJsonResponse =
						contentType?.includes('application/json') || contentType?.includes('+json');

					if (isJsonResponse) {
						try {
							errorData = APIErrorSchema.parse(JSON.parse(responseBody));
						} catch (parseEx) {
							// Log at debug level since this is a contract violation from the server
							this.#logger.debug(
								'Failed to parse JSON error response from API: %s (url: %s, sessionId: %s)',
								parseEx,
								url,
								sessionId
							);
						}
					} else {
						// Non-JSON response (e.g., HTML error page), skip structured error parsing
						this.#logger.debug(
							'Received non-JSON error response (content-type: %s), skipping structured error parsing (url: %s, sessionId: %s)',
							contentType ?? 'unknown',
							url,
							sessionId
						);
					}

					// Sanitize headers to avoid leaking API keys
					const sanitizedHeaders = { ...headers };
					for (const key in sanitizedHeaders) {
						const lk = key.toLowerCase();
						if (
							lk === 'authorization' ||
							lk === 'x-api-key' ||
							lk.includes('secret') ||
							lk.includes('key') ||
							lk.includes('token')
						) {
							sanitizedHeaders[key] = 'REDACTED';
						}
					}

					this.#logger.debug('API Error Details:');
					this.#logger.debug('  URL:', url);
					this.#logger.debug('  Method:', method);
					this.#logger.debug('  Status:', response.status, response.statusText);
					this.#logger.debug('  Headers:', JSON.stringify(sanitizedHeaders, null, 2));
					this.#logger.debug('  Response:', responseBody);

					// Check for UPGRADE_REQUIRED error
					if (errorData?.code === 'UPGRADE_REQUIRED') {
						// Skip version check if configured
						if (this.#config?.skipVersionCheck) {
							this.#logger.debug('Skipping version check (configured to skip)');
							// Request is still rejected, but throw UpgradeRequiredError so callers
							// can detect it and handle UI behavior (e.g., suppress banner) based on skip flag
							throw new UpgradeRequiredError({ sessionId });
						}

						throw new UpgradeRequiredError({ sessionId });
					}

					// Handle Zod validation errors from the API
					if (
						typeof errorData?.error === 'object' &&
						errorData?.error?.name === 'ZodError' &&
						errorData.error.issues
					) {
						throw new ValidationOutputError({
							url,
							issues: errorData.error.issues,
							sessionId,
						});
					}

					// Throw with message from API if available
					if (errorData?.message) {
						throw new APIError({
							url,
							status: response.status,
							message:
								typeof errorData.error === 'string'
									? errorData.error
									: (errorData.message ??
										'The API encountered an unexpected error attempting to reach the service.'),
							sessionId,
						});
					}

					// Provide status-aware fallback messages when no structured error data is available
					throw new APIError({
						message: this.#getStatusAwareErrorMessage(
							response.status,
							isJsonResponse ?? false
						),
						url: url,
						status: response.status,
						sessionId,
					});
				}

				this.#logger.debug('%s succeeded with status: %d', url, response.status);

				// Successful response; handle empty bodies (e.g., 204 No Content)
				if (response.status === 204 || response.headers.get('content-length') === '0') {
					return new Response(null, { status: 204 });
				}

				return response;
			} catch (error) {
				this.#logger.debug('error sending to %s: %s', url, error);

				// Check if it's a retryable connection error
				const isRetryable = this.#isRetryableError(error);

				if (isRetryable && attempt < maxRetries) {
					this.#logger.debug(
						`Connection error, retrying (attempt ${attempt + 1}/${maxRetries + 1}):`,
						error
					);
					await this.#sleep(this.#getRetryDelay(attempt, baseDelayMs));
					continue;
				}

				throw error;
			}
		}

		this.#logger.debug('max retries trying: %s', url);

		throw new MaxRetriesError();
	}

	#isRetryableError(error: unknown): boolean {
		if (error && typeof error === 'object') {
			const err = error as { code?: string; errno?: number };
			// Retryable connection errors
			return (
				err.code === 'ECONNRESET' ||
				err.code === 'ETIMEDOUT' ||
				err.code === 'ECONNREFUSED' ||
				err.code === 'ENOTFOUND'
			);
		}
		return false;
	}

	#getRetryDelay(attempt: number, baseDelayMs: number): number {
		// Exponential backoff with jitter: delay = base * 2^attempt * (0.5 + random(0, 0.5))
		const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
		const jitter = 0.5 + Math.random() * 0.5;
		return Math.floor(exponentialDelay * jitter);
	}

	#sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	#getRateLimitDelay(response: Response): number | null {
		// Check for Retry-After header (standard HTTP)
		const retryAfter = response.headers.get('Retry-After');
		if (retryAfter) {
			// Can be either seconds or HTTP date
			const seconds = parseInt(retryAfter, 10);
			if (!isNaN(seconds)) {
				return seconds * 1000; // Convert to milliseconds
			}
			// Try parsing as HTTP date
			const retryDate = new Date(retryAfter);
			if (!isNaN(retryDate.getTime())) {
				const delayMs = retryDate.getTime() - Date.now();
				return Math.max(0, delayMs);
			}
		}

		// Check for X-RateLimit-Reset (Unix timestamp in seconds)
		const rateLimitReset = response.headers.get('X-RateLimit-Reset');
		if (rateLimitReset) {
			const resetTime = parseInt(rateLimitReset, 10);
			if (!isNaN(resetTime)) {
				const delayMs = resetTime * 1000 - Date.now();
				return Math.max(0, delayMs);
			}
		}

		// Check for X-RateLimit-Retry-After (seconds)
		const rateLimitRetryAfter = response.headers.get('X-RateLimit-Retry-After');
		if (rateLimitRetryAfter) {
			const seconds = parseInt(rateLimitRetryAfter, 10);
			if (!isNaN(seconds)) {
				return seconds * 1000;
			}
		}

		return null;
	}

	#getStatusAwareErrorMessage(status: number, isJsonResponse: boolean): string {
		// Provide helpful, status-specific error messages
		switch (status) {
			case 400:
				return 'The API request was invalid (HTTP 400). Please check your request parameters.';
			case 401:
				return 'Authentication failed (HTTP 401). Please check your credentials or try logging in again.';
			case 403:
				return 'Access denied (HTTP 403). You do not have permission to perform this action.';
			case 404:
				return isJsonResponse
					? 'The requested resource was not found (HTTP 404).'
					: 'The API endpoint was not found (HTTP 404). Please verify your API URL configuration is correct.';
			case 409:
				return 'A conflict occurred (HTTP 409). The resource may already exist or be in use.';
			case 429:
				return 'Too many requests (HTTP 429). Please wait a moment and try again.';
			case 500:
				return 'The API server encountered an internal error (HTTP 500). Please try again later.';
			case 502:
				return 'The API service is temporarily unavailable (HTTP 502). Please try again later.';
			case 503:
				return 'The API service is currently unavailable (HTTP 503). Please try again later.';
			case 504:
				return 'The API request timed out (HTTP 504). Please try again later.';
			default:
				return `The API returned an unexpected error (HTTP ${status}).`;
		}
	}
}

export function getAPIBaseURL(region?: string, overrides?: { api_url?: string }): string {
	if (process.env.AGENTUITY_API_URL) {
		return process.env.AGENTUITY_API_URL;
	}

	if (overrides?.api_url) {
		return overrides.api_url;
	}

	if (region === 'local') {
		return 'https://api.agentuity.io';
	}

	return 'https://api-v1.agentuity.com';
}

export function getAppBaseURL(region?: string, overrides?: { app_url?: string } | null): string {
	if (process.env.AGENTUITY_APP_URL) {
		return process.env.AGENTUITY_APP_URL;
	}

	if (overrides?.app_url) {
		return overrides.app_url;
	}

	if (region === 'local') {
		return 'https://app.agentuity.io';
	}

	return 'https://app-v1.agentuity.com';
}

export const APIResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
	z.discriminatedUnion('success', [
		z.object({
			success: z.literal<false>(false),
			message: z.string().describe('the error message'),
		}),
		z.object({
			success: z.literal<true>(true),
			data: dataSchema,
		}),
	]);

export const APIResponseSchemaOptionalData = <T extends z.ZodType>(dataSchema: T) =>
	z.discriminatedUnion('success', [
		z.object({
			success: z.literal<false>(false),
			message: z.string().describe('the error message'),
		}),
		z.object({
			success: z.literal<true>(true),
			data: dataSchema.optional(),
		}),
	]);

export const APIResponseSchemaNoData = () =>
	z.discriminatedUnion('success', [
		z.object({
			success: z.literal<false>(false),
			message: z.string().describe('the error message'),
		}),
		z.object({
			success: z.literal<true>(true),
		}),
	]);
