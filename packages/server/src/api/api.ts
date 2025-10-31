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

export interface APIErrorResponse {
	success: boolean;
	code?: string;
	message: string;
	details?: Record<string, unknown>;
}

export interface APIClientConfig {
	skipVersionCheck?: boolean;
	userAgent?: string;
}

export class ValidationError extends Error {
	constructor(
		message: string,
		public issues: z.ZodIssue[]
	) {
		super(message);
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
	private baseUrl: string;
	private apiKey?: string;
	private config?: APIClientConfig;

	constructor(baseUrl: string, config?: APIClientConfig);
	constructor(baseUrl: string, apiKey: string, config?: APIClientConfig);
	constructor(
		baseUrl: string,
		apiKeyOrConfig?: string | APIClientConfig,
		config?: APIClientConfig
	) {
		this.baseUrl = baseUrl;

		// Detect if second parameter is apiKey (string) or config (object)
		if (typeof apiKeyOrConfig === 'string') {
			this.apiKey = apiKeyOrConfig;
			this.config = config;
		} else {
			this.apiKey = undefined;
			this.config = apiKeyOrConfig;
		}
	}

	async request<TResponse, TBody = unknown>(
		method: string,
		endpoint: string,
		responseSchema: z.ZodType<TResponse>,
		body?: TBody,
		bodySchema?: z.ZodType<TBody>
	): Promise<TResponse> {
		// Validate request body if schema provided
		if (body !== undefined && bodySchema) {
			const validationResult = bodySchema.safeParse(body);
			if (!validationResult.success) {
				throw new ValidationError(
					'Request body validation failed',
					validationResult.error.issues
				);
			}
		}

		const response = await this.makeRequest(method, endpoint, body);

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
				if (contentType && contentType.includes('application/json')) {
					data = JSON.parse(text);
				} else {
					data = text;
				}
			}
		}

		// Validate response
		const validationResult = responseSchema.safeParse(data);
		if (!validationResult.success) {
			throw new ValidationError('Response validation failed', validationResult.error.issues);
		}

		return validationResult.data;
	}

	private async makeRequest(method: string, endpoint: string, body?: unknown): Promise<Response> {
		const url = `${this.baseUrl}${endpoint}`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		if (this.config?.userAgent) {
			headers['User-Agent'] = this.config.userAgent;
		}

		if (this.apiKey) {
			headers['Authorization'] = `Bearer ${this.apiKey}`;
		}

		const response = await fetch(url, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});

		if (!response.ok) {
			const responseBody = await response.text();

			// Try to parse error response
			let errorData: APIErrorResponse | null = null;
			try {
				errorData = JSON.parse(responseBody) as APIErrorResponse;
			} catch {
				// Not JSON, ignore
			}

			if (process.env.DEBUG) {
				// Sanitize headers to avoid leaking API keys
				const sanitizedHeaders = { ...headers };
				for (const key in sanitizedHeaders) {
					if (key.toLowerCase() === 'authorization') {
						sanitizedHeaders[key] = 'REDACTED';
					}
				}

				console.error('API Error Details:');
				console.error('  URL:', url);
				console.error('  Method:', method);
				console.error('  Status:', response.status, response.statusText);
				console.error('  Headers:', JSON.stringify(sanitizedHeaders, null, 2));
				console.error('  Response:', responseBody);
			}

			// Check for UPGRADE_REQUIRED error
			if (errorData?.code === 'UPGRADE_REQUIRED') {
				// Skip version check if configured
				if (this.config?.skipVersionCheck) {
					if (process.env.DEBUG) {
						console.error('[DEBUG] Skipping version check (configured to skip)');
					}
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
	z.object({
		success: z.boolean(),
		message: z.string().optional().describe('the error message if success=false'),
		data: dataSchema.optional(),
	});
