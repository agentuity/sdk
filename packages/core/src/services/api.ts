/**
 * API Client for Agentuity Platform
 *
 * Handles HTTP requests to the API with automatic error parsing and User-Agent headers.
 */

import { z } from 'zod';
import type { Logger } from '../logger.ts';
import { StructuredError } from '../error.ts';
import { getEnv } from './env.ts';

function getVersion(): string {
	return getEnv('AGENTUITY_CLI_VERSION') ?? 'dev';
}

function getUserAgent(): string {
	return `Agentuity SDK/${getVersion()}`;
}

export const APIClientConfigSchema = z.object({
	skipVersionCheck: z
		.boolean()
		.optional()
		.describe('Skip client/server SDK version compatibility checks'),
	userAgent: z.string().optional().describe('Override the default User-Agent header value'),
	maxRetries: z.number().optional().describe('Maximum retry attempts for failed API requests'),
	retryDelayMs: z
		.number()
		.optional()
		.describe('Base delay in milliseconds between retry attempts'),
	headers: z
		.record(z.string(), z.string())
		.optional()
		.describe('Additional default headers to include on API requests'),
	serviceUnavailableTimeoutMs: z
		.number()
		.optional()
		.describe('Maximum milliseconds to keep retrying 502/503 service unavailable responses'),
});

export type APIClientConfig = z.infer<typeof APIClientConfigSchema>;

export const ZodIssuesSchema = z
	.array(
		z.object({
			code: z.string().describe('Zod issue code identifying the validation error type.'),
			input: z.unknown().optional().describe('The input value that failed validation.'),
			path: z
				.array(z.union([z.string(), z.number()]))
				.describe('Path to the field that failed validation.'),
			message: z.string().describe('Human-readable error message.'),
		})
	)
	.describe('Array of Zod validation issues.');

export type IssuesType = z.infer<typeof ZodIssuesSchema>;

const toIssues = (issues: z.core.$ZodIssue[]): IssuesType => {
	return issues.map((issue) => ({
		code: issue.code,
		input: issue.input,
		path: issue.path.map((x) => (typeof x === 'number' ? x : String(x))),
		message: issue.message,
	}));
};

export const APIErrorSchema = z
	.object({
		success: z.boolean().describe('Whether the API request was successful.'),
		code: z.string().optional().describe('Machine-readable error code.'),
		message: z.string().optional().describe('Human-readable error message.'),
		error: z
			.union([
				z.string(),
				z.object({
					name: z.string().optional().describe('Error class name.'),
					issues: ZodIssuesSchema.optional().describe(
						'Validation issues if the error is a Zod validation failure.'
					),
				}),
			])
			.optional()
			.describe(
				'Error details — either a string message or a structured error with validation issues.'
			),
		details: z.record(z.string(), z.unknown()).optional().describe('Additional error details.'),
	})
	.describe('Standard API error response.');

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
	'Upgrade required to continue. Please run `agentuity upgrade` or see https://agentuity.dev/Get-Started/installation to download the latest version.'
)<{
	sessionId?: string | null;
}>();

export const MaxRetriesError = StructuredError(
	'MaxRetriesError',
	'Max Retries attempted and continued failures exhausted.'
);

export const MisdirectedRequestError = StructuredError(
	'MisdirectedRequestError',
	'The request was sent to the wrong regional server.'
)<{
	url: string;
	region: string;
	sessionId?: string | null;
}>();

export const PaymentRequiredError = StructuredError(
	'PaymentRequiredError',
	'This action requires a paid plan. Please upgrade your account to continue.'
)<{
	url: string;
	sessionId?: string | null;
	upgradeUrl?: string;
}>();

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
		if (!this.#apiKey) {
			const envKey = getEnv('AGENTUITY_SDK_KEY');
			if (envKey) {
				this.#apiKey = envKey;
			}
		}
	}

	/**
	 * GET request
	 */
	async get<TResponse = void>(
		endpoint: string,
		responseSchema?: z.ZodType<TResponse>,
		signal?: AbortSignal,
		extraHeaders?: Record<string, string>
	): Promise<TResponse> {
		return this.request(
			'GET',
			endpoint,
			responseSchema,
			undefined,
			undefined,
			signal,
			extraHeaders
		);
	}

	/**
	 * POST request with optional body
	 */
	async post<TResponse = void, TBody = unknown>(
		endpoint: string,
		body?: TBody,
		responseSchema?: z.ZodType<TResponse>,
		bodySchema?: z.ZodType<TBody>,
		signal?: AbortSignal,
		extraHeaders?: Record<string, string>
	): Promise<TResponse> {
		return this.request('POST', endpoint, responseSchema, body, bodySchema, signal, extraHeaders);
	}

	/**
	 * PUT request with optional body
	 */
	async put<TResponse = void, TBody = unknown>(
		endpoint: string,
		body?: TBody,
		responseSchema?: z.ZodType<TResponse>,
		bodySchema?: z.ZodType<TBody>,
		signal?: AbortSignal,
		extraHeaders?: Record<string, string>
	): Promise<TResponse> {
		return this.request('PUT', endpoint, responseSchema, body, bodySchema, signal, extraHeaders);
	}

	/**
	 * DELETE request
	 */
	async delete<TResponse = void>(
		endpoint: string,
		responseSchema?: z.ZodType<TResponse>,
		signal?: AbortSignal,
		extraHeaders?: Record<string, string>
	): Promise<TResponse> {
		return this.request(
			'DELETE',
			endpoint,
			responseSchema,
			undefined,
			undefined,
			signal,
			extraHeaders
		);
	}

	/**
	 * PATCH request with optional body
	 */
	async patch<TResponse = void, TBody = unknown>(
		endpoint: string,
		body?: TBody,
		responseSchema?: z.ZodType<TResponse>,
		bodySchema?: z.ZodType<TBody>,
		signal?: AbortSignal,
		extraHeaders?: Record<string, string>
	): Promise<TResponse> {
		return this.request(
			'PATCH',
			endpoint,
			responseSchema,
			body,
			bodySchema,
			signal,
			extraHeaders
		);
	}

	/**
	 * Raw GET request that returns the Response object directly.
	 * Useful for streaming responses where you need access to the body stream.
	 */
	async rawGet(
		endpoint: string,
		signal?: AbortSignal,
		extraHeaders?: Record<string, string>
	): Promise<Response> {
		return this.#makeRequest('GET', endpoint, undefined, signal, undefined, extraHeaders, true);
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
		return this.#makeRequest('POST', endpoint, body, signal, contentType, undefined, true);
	}

	/**
	 * Raw PUT request that returns the Response object directly.
	 * Useful for binary uploads where you need to pass raw body data.
	 */
	async rawPut(
		endpoint: string,
		body: Uint8Array | ArrayBuffer | ReadableStream<Uint8Array> | string | Blob,
		contentType: string,
		signal?: AbortSignal,
		extraHeaders?: Record<string, string>
	): Promise<Response> {
		return this.#makeRequest('PUT', endpoint, body, signal, contentType, extraHeaders, true);
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
		signal?: AbortSignal,
		extraHeaders?: Record<string, string>
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

		const response = await this.#makeRequest(
			method,
			endpoint,
			body,
			signal,
			undefined,
			extraHeaders
		);

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
		contentType?: string,
		extraHeaders?: Record<string, string>,
		raw?: boolean
	): Promise<Response> {
		this.#logger.trace('sending %s to %s%s', method, this.#baseUrl, endpoint);

		const maxRetries = this.#config?.maxRetries ?? 3;
		const baseDelayMs = this.#config?.retryDelayMs ?? 100;
		const serviceUnavailableTimeoutMs = this.#config?.serviceUnavailableTimeoutMs ?? 30_000;

		// Track when we first see a 502/503 so we can retry for up to the timeout
		let serviceUnavailableStart: number | null = null;

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
		} else {
			headers['User-Agent'] = getUserAgent();
		}

		if (this.#apiKey) {
			headers['Authorization'] = `Bearer ${this.#apiKey}`;
		}

		if (this.#config?.headers) {
			Object.keys(this.#config.headers).forEach((key) => {
				const value = this.#config?.headers?.[key];
				if (value !== undefined) {
					headers[key] = value;
				}
			});
		}

		// Apply per-request extra headers (e.g., x-agentuity-orgid for CLI auth)
		if (extraHeaders) {
			Object.keys(extraHeaders).forEach((key) => {
				const value = extraHeaders[key];
				if (value !== undefined) {
					headers[key] = value;
				}
			});
		}

		const canRetry = !(body instanceof ReadableStream); // we cannot safely retry a ReadableStream as body

		let attempt = 0;
		while (true) {
			try {
				let response: Response;

				try {
					let requestBody:
						| Uint8Array
						| ArrayBuffer
						| ReadableStream<Uint8Array>
						| string
						| Blob
						| undefined;
					if (body !== undefined) {
						if (contentType && contentType !== 'application/json') {
							requestBody = body as
								| Uint8Array
								| ArrayBuffer
								| ReadableStream<Uint8Array>
								| string
								| Blob;
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

				// Handle 421 Misdirected Request - the resource is in a different region
				// We need to retry against the correct regional Catalyst
				// Only handle this for Catalyst URLs (not the main API)
				if (response.status === 421 && this.#isCatalystUrl()) {
					const targetRegion = response.headers.get('x-agentuity-region');
					if (targetRegion && canRetry) {
						const regionalUrl = this.#buildRegionalUrl(targetRegion, endpoint);
						this.#logger.debug(
							`Got 421 Misdirected Request, resource is in region ${targetRegion}, retrying against ${regionalUrl} (sessionId: ${sessionId ?? null})`
						);

						// Retry the request against the correct regional Catalyst
						let requestBody:
							| Uint8Array
							| ArrayBuffer
							| ReadableStream<Uint8Array>
							| string
							| Blob
							| undefined;
						if (body !== undefined) {
							if (contentType && contentType !== 'application/json') {
								requestBody = body as
									| Uint8Array
									| ArrayBuffer
									| ReadableStream<Uint8Array>
									| string
									| Blob;
							} else {
								requestBody = JSON.stringify(body);
							}
						}

						const regionalResponse = await fetch(regionalUrl, {
							method,
							headers,
							body: requestBody,
							signal,
						});

						// If the regional request also fails with 421, throw MisdirectedRequestError
						if (regionalResponse.status === 421) {
							throw new MisdirectedRequestError({
								url: regionalUrl,
								region: targetRegion,
								sessionId: regionalResponse.headers.get('x-session-id'),
							});
						}

						// For all other responses (success or error), assign to response
						// and let the normal flow handle it (error handling, validation, etc.)
						response = regionalResponse;
					} else {
						// No region header or can't retry - throw error
						throw new MisdirectedRequestError({
							url,
							region: targetRegion ?? 'unknown',
							sessionId,
						});
					}
				}

				// 502/503 indicate the service is restarting (hot-swap) — retry
				// for up to serviceUnavailableTimeoutMs (default 30s) with a
				// slower backoff (1s base) so we survive typical restart windows.
				const isServiceUnavailable = response.status === 502 || response.status === 503;

				if (isServiceUnavailable && canRetry) {
					if (serviceUnavailableStart === null) {
						serviceUnavailableStart = Date.now();
					}
					const elapsed = Date.now() - serviceUnavailableStart;
					if (elapsed < serviceUnavailableTimeoutMs) {
						// Use 1s base delay with exponential backoff, capped at 5s
						const delayMs = Math.min(this.#getRetryDelay(attempt, 1000), 5000);
						this.#logger.debug(
							`Got ${response.status} sending to ${url}, service unavailable for ${Math.round(elapsed / 1000)}s, retrying (will delay ${delayMs}ms), sessionId: ${sessionId ?? null}`
						);
						await this.#sleep(delayMs);
						attempt++;
						continue;
					}
				}

				// Check if we should retry on specific status codes (409, 501)
				const retryableStatuses = [409, 501];
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

					attempt++;
					continue;
				}

				// Handle error responses
				// When raw mode is set, skip error handling and return the response as-is
				// so callers (e.g., sandboxReadFile) can inspect the status and provide
				// context-aware error messages (including sandbox ID, file path, etc.).
				if (!raw && !response.ok) {
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

					// HTTP 426 always forces upgrade (cannot be skipped - emergency upgrade path)
					if (response.status === 426) {
						throw new UpgradeRequiredError({ sessionId });
					}

					// HTTP 402 Payment Required - user needs to upgrade their plan
					if (response.status === 402) {
						const upgradeUrl = response.headers.get('x-upgrade-url');
						throw new PaymentRequiredError({
							url,
							sessionId,
							upgradeUrl: upgradeUrl ?? undefined,
						});
					}

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

				// In raw mode, return the untouched Response (status, headers, body)
				// so callers can inspect everything themselves.
				if (raw) {
					return response;
				}

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
					attempt++;
					continue;
				}

				throw error;
			}
		}
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
		const exponentialDelay = baseDelayMs * 2 ** attempt;
		const jitter = 0.5 + Math.random() * 0.5;
		return Math.floor(exponentialDelay * jitter);
	}

	#sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Check if the base URL is a Catalyst URL.
	 * We only handle 421 Misdirected Request for Catalyst URLs, not the main API.
	 */
	#isCatalystUrl(): boolean {
		try {
			const url = new URL(this.#baseUrl);
			return url.hostname.includes('catalyst');
		} catch {
			return false;
		}
	}

	/**
	 * Build a URL for a specific regional Catalyst instance.
	 * Used when retrying requests that received 421 Misdirected Request.
	 */
	#buildRegionalUrl(region: string, endpoint: string): string {
		// Determine the domain suffix based on region
		const isLocal = region === 'local' || region === 'l';
		const domainSuffix = isLocal ? 'agentuity.io' : 'agentuity.cloud';

		// Build the regional Catalyst URL
		// For local: https://catalyst.agentuity.io
		// For production: https://catalyst-{region}.agentuity.cloud
		const baseUrl = isLocal
			? `https://catalyst.${domainSuffix}`
			: `https://catalyst-${region}.${domainSuffix}`;

		return `${baseUrl}${endpoint}`;
	}

	#getRateLimitDelay(response: Response): number | null {
		// Check for Retry-After header (standard HTTP)
		const retryAfter = response.headers.get('Retry-After');
		if (retryAfter) {
			// Can be either seconds or HTTP date
			const seconds = parseInt(retryAfter, 10);
			if (!Number.isNaN(seconds)) {
				return seconds * 1000; // Convert to milliseconds
			}
			// Try parsing as HTTP date
			const retryDate = new Date(retryAfter);
			if (!Number.isNaN(retryDate.getTime())) {
				const delayMs = retryDate.getTime() - Date.now();
				return Math.max(0, delayMs);
			}
		}

		// Check for X-RateLimit-Reset (Unix timestamp in seconds)
		const rateLimitReset = response.headers.get('X-RateLimit-Reset');
		if (rateLimitReset) {
			const resetTime = parseInt(rateLimitReset, 10);
			if (!Number.isNaN(resetTime)) {
				const delayMs = resetTime * 1000 - Date.now();
				return Math.max(0, delayMs);
			}
		}

		// Check for X-RateLimit-Retry-After (seconds)
		const rateLimitRetryAfter = response.headers.get('X-RateLimit-Retry-After');
		if (rateLimitRetryAfter) {
			const seconds = parseInt(rateLimitRetryAfter, 10);
			if (!Number.isNaN(seconds)) {
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
			case 402:
				return 'This action requires a paid plan. Please upgrade your account at https://app.agentuity.com/billing to continue.';
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
	const envUrl = getEnv('AGENTUITY_API_URL');
	if (envUrl) {
		return envUrl;
	}

	if (overrides?.api_url) {
		return overrides.api_url;
	}

	if (region === 'local') {
		return 'https://api.agentuity.io';
	}

	return 'https://api.agentuity.com';
}

export function getAppBaseURL(region?: string, overrides?: { app_url?: string } | null): string {
	const envUrl = getEnv('AGENTUITY_APP_URL');
	if (envUrl) {
		return envUrl;
	}

	if (overrides?.app_url) {
		return overrides.app_url;
	}

	if (region === 'local') {
		return 'https://app.agentuity.io';
	}

	return 'https://app.agentuity.com';
}

export const APIResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
	z.discriminatedUnion('success', [
		z.object({
			success: z.literal<false>(false).describe('Indicates the API request failed.'),
			message: z.string().describe('the error message'),
			code: z.string().optional().describe('machine-readable error code'),
		}),
		z.object({
			success: z.literal<true>(true).describe('Indicates the API request succeeded.'),
			data: dataSchema.describe('The response data.'),
		}),
	]);

export const APIResponseSchemaOptionalData = <T extends z.ZodType>(dataSchema: T) =>
	z.discriminatedUnion('success', [
		z.object({
			success: z.literal<false>(false).describe('Indicates the API request failed.'),
			message: z.string().describe('the error message'),
			code: z.string().optional().describe('machine-readable error code'),
		}),
		z.object({
			success: z.literal<true>(true).describe('Indicates the API request succeeded.'),
			data: dataSchema.optional().describe('The response data, if available.'),
		}),
	]);

export const APIResponseSchemaNoData = () =>
	z.discriminatedUnion('success', [
		z.object({
			success: z.literal<false>(false).describe('Indicates the API request failed.'),
			message: z.string().describe('the error message'),
			code: z.string().optional().describe('machine-readable error code'),
		}),
		z.object({
			success: z.literal<true>(true).describe('Indicates the API request succeeded.'),
		}),
	]);
