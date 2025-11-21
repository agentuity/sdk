/**
 * API Client for Agentuity Platform
 *
 * Handles HTTP requests to the API with automatic error parsing and User-Agent headers.
 *
 * Error handling:
 * - UPGRADE_REQUIRED (409): Throws UpgradeRequiredError
 * - Other errors: Throws Error with API message or status text
 */

import { z } from 'zod';
import type { Logger } from '@agentuity/core';

export interface APIErrorResponse {
	success: boolean;
	code?: string;
	message?: string;
	error?: {
		name?: string;
		issues?: z.ZodIssue[];
	};
	details?: Record<string, unknown>;
}

export interface APIClientConfig {
	skipVersionCheck?: boolean;
	userAgent?: string;
	maxRetries?: number;
	retryDelayMs?: number;
}

export class ValidationError extends Error {
	public url: string;
	constructor(
		url: string,
		message: string,
		public issues: z.ZodIssue[]
	) {
		super(message);
		this.url = url;
		this.name = 'ValidationError';
	}
}

export class UpgradeRequiredError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UpgradeRequiredError';
	}
}

export class APIError extends Error {
	constructor(
		message: string,
		public status: number,
		public code?: string
	) {
		super(message);
		this.name = 'APIError';
	}
}

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

	async request<TResponse = void, TBody = unknown>(
		method: string,
		endpoint: string,
		responseSchema?: z.ZodType<TResponse>,
		body?: TBody,
		bodySchema?: z.ZodType<TBody>
	): Promise<TResponse> {
		// Validate request body if schema provided
		if (body !== undefined && bodySchema) {
			const validationResult = bodySchema.safeParse(body);
			if (!validationResult.success) {
				throw new ValidationError(
					endpoint,
					'Request body validation failed',
					validationResult.error.issues
				);
			}
		}

		const response = await this.#makeRequest(method, endpoint, body);

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
				throw new ValidationError(
					endpoint,
					'Response validation failed',
					validationResult.error.issues
				);
			}

			return validationResult.data;
		}

		return undefined as TResponse;
	}

	async #makeRequest(method: string, endpoint: string, body?: unknown): Promise<Response> {
		this.#logger.trace('sending %s to %s', method, endpoint);

		const maxRetries = this.#config?.maxRetries ?? 3;
		const baseDelayMs = this.#config?.retryDelayMs ?? 100;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const url = `${this.#baseUrl}${endpoint}`;
				const headers: Record<string, string> = {
					'Content-Type': 'application/json',
				};

				if (this.#config?.userAgent) {
					headers['User-Agent'] = this.#config.userAgent;
				}

				if (this.#apiKey) {
					headers['Authorization'] = `Bearer ${this.#apiKey}`;
				}

				// Log request body for debugging deployment issues
				if (body !== undefined && endpoint.includes('/deploy/')) {
					this.#logger.debug('Request body: %s', JSON.stringify(body, null, 2));
				}

				const response = await fetch(url, {
					method,
					headers,
					body: body !== undefined ? JSON.stringify(body) : undefined,
				});

				// Check if we should retry on specific status codes (409, 501, 503)
				const retryableStatuses = [409, 501, 503];
				if (retryableStatuses.includes(response.status) && attempt < maxRetries) {
					let delayMs = this.#getRetryDelay(attempt, baseDelayMs);

					// For 409, check for rate limit headers
					if (response.status === 409) {
						const rateLimitDelay = this.#getRateLimitDelay(response);
						if (rateLimitDelay !== null) {
							delayMs = rateLimitDelay;
							this.#logger.debug(
								`Got 409 with rate limit headers, waiting ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`
							);
						} else {
							this.#logger.debug(
								`Got 409, retrying with backoff ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`
							);
						}
					} else {
						this.#logger.debug(
							`Got ${response.status}, retrying (attempt ${attempt + 1}/${maxRetries + 1})`
						);
					}

					await this.#sleep(delayMs);
					continue;
				}

				// Handle error responses
				if (!response.ok) {
					const responseBody = await response.text();

					// Try to parse error response
					let errorData: APIErrorResponse | null = null;
					try {
						errorData = JSON.parse(responseBody) as APIErrorResponse;
					} catch {
						// Not JSON, ignore
					}

					// Sanitize headers to avoid leaking API keys
					const sanitizedHeaders = { ...headers };
					for (const key in sanitizedHeaders) {
						if (key.toLowerCase() === 'authorization') {
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
							throw new UpgradeRequiredError(
								errorData.message ||
									'Version check skipped, but request failed. Try upgrading the client.'
							);
						}

						throw new UpgradeRequiredError(
							errorData.message || 'Please upgrade to the latest version'
						);
					}

					// Handle Zod validation errors from the API
					if (errorData?.error?.name === 'ZodError' && errorData.error.issues) {
						throw new ValidationError(url, 'API validation failed', errorData.error.issues);
					}

					// Throw with message from API if available
					if (errorData?.message) {
						throw new APIError(errorData.message, response.status, errorData.code);
					}

					throw new APIError(
						`API error: ${response.status} ${response.statusText}`,
						response.status
					);
				}

				// Successful response; handle empty bodies (e.g., 204 No Content)
				if (response.status === 204 || response.headers.get('content-length') === '0') {
					return new Response(null, { status: 204 });
				}

				return response;
			} catch (error) {
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

		throw new Error('Max retries exceeded');
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
}

export function getAPIBaseURL(overrides?: { api_url?: string }): string {
	if (process.env.AGENTUITY_API_URL) {
		return process.env.AGENTUITY_API_URL;
	}

	if (overrides?.api_url) {
		return overrides.api_url;
	}

	return 'https://api.agentuity.com';
}

export function getAppBaseURL(overrides?: { app_url?: string }): string {
	if (process.env.AGENTUITY_APP_URL) {
		return process.env.AGENTUITY_APP_URL;
	}

	if (overrides?.app_url) {
		return overrides.app_url;
	}

	return 'https://app.agentuity.com';
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
