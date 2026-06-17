import { safeStringify } from './json.ts';
import type { Body, HttpMethod } from './fetch.ts';
import { ServiceException } from './exception.ts';

/**
 * Extract a human-readable error message from an HTML error page or plain text body.
 * Looks for content inside `<p>` tags first (Agentuity error pages put the message there),
 * then falls back to the raw body.
 */
function extractMessageFromBody(body: string): string {
	if (body.includes('<html') || body.includes('<!DOCTYPE')) {
		const pMatch = /<p[^>]*>([^<]+)<\/p>/i.exec(body);
		if (pMatch?.[1]) {
			const msg = pMatch[1].trim();
			const refMatch = /^(.+?)\s*\(ref:\s*\S+\)$/.exec(msg);
			return refMatch?.[1]?.trim() ?? msg;
		}
		const h1Match = /<h1[^>]*>([^<]+)<\/h1>/i.exec(body);
		if (h1Match?.[1]) {
			return h1Match[1].trim();
		}
	}
	return body;
}

export const buildUrl = (
	base: string,
	path: string,
	subpath?: string,
	query?: URLSearchParams
): string => {
	path = path.startsWith('/') ? path : `/${path}`;
	let url = base.replace(/\/$/, '') + path;
	if (subpath) {
		subpath = subpath.startsWith('/') ? subpath : `/${subpath}`;
		url += subpath;
	}
	if (query) {
		url += `?${query.toString()}`;
	}
	return url;
};

export async function toServiceException(
	method: HttpMethod,
	url: string,
	response: Response
): Promise<InstanceType<typeof ServiceException>> {
	const sessionId = response.headers.get('x-session-id');
	switch (response.status) {
		case 401:
		case 403:
			return new ServiceException({
				message: 'Unauthorized',
				method,
				url,
				statusCode: response.status,
				sessionId,
			});
		case 402:
			return new ServiceException({
				message:
					'This action requires a paid plan. Please upgrade your account at https://app.agentuity.com/billing to continue.',
				method,
				url,
				statusCode: response.status,
				sessionId,
			});
		case 404:
			return new ServiceException({
				message: 'Not Found',
				method,
				url,
				statusCode: response.status,
				sessionId,
			});
		default:
	}
	const ct = response.headers.get('content-type');
	if (ct?.includes('json')) {
		try {
			const payload = (await response.json()) as { message?: string; error?: string };
			if (payload.error) {
				return new ServiceException({
					message: payload.error,
					method,
					url,
					statusCode: response.status,
					sessionId,
				});
			}
			if (payload.message) {
				return new ServiceException({
					message: payload.message,
					method,
					url,
					statusCode: response.status,
					sessionId,
				});
			}
			return new ServiceException({
				message: JSON.stringify(payload),
				method,
				url,
				statusCode: response.status,
				sessionId,
			});
		} catch {
			/** don't worry */
		}
	}
	try {
		const body = await response.text();
		const message = extractMessageFromBody(body);
		return new ServiceException({
			message,
			method,
			url,
			statusCode: response.status,
			sessionId,
		});
	} catch {
		/* fall through */
	}

	return new ServiceException({
		message: response.statusText,
		method,
		url,
		statusCode: response.status,
		sessionId,
	});
}

const binaryContentType = 'application/octet-stream';
const textContentType = 'text/plain';
const jsonContentType = 'application/json';

export async function toPayload(data: unknown): Promise<[Body, string | undefined]> {
	if (data === undefined || data === null) {
		return ['', textContentType];
	}
	switch (typeof data) {
		case 'string':
			if (
				(data.charAt(0) === '{' && data.charAt(data.length - 1) === '}') ||
				(data.charAt(0) === '[' && data.charAt(data.length - 1) === ']')
			) {
				try {
					JSON.parse(data);
					return [data, jsonContentType];
				} catch {
					/* fall through */
				}
			}
			return [data, textContentType];
		case 'boolean':
		case 'number':
			return [JSON.stringify(data), jsonContentType];
		case 'bigint':
			return [data.toString(), textContentType];
		case 'symbol':
			throw new TypeError('Unsupported payload type: symbol');
		case 'function':
			return toPayload((data as () => unknown)());
		case 'object': {
			if (data instanceof ArrayBuffer) {
				return [data, binaryContentType];
			}
			if (data instanceof Uint8Array) {
				const buffer =
					data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
						? data.buffer
						: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
				return [buffer as ArrayBuffer, binaryContentType];
			}
			if (data instanceof Blob) {
				return [data, data.type || binaryContentType];
			}
			if (data instanceof FormData) {
				return [data, undefined];
			}
			if (data instanceof ReadableStream) {
				return [data, binaryContentType];
			}
			if (data instanceof Promise) {
				return toPayload(await data);
			}
			return [safeStringify(data), jsonContentType];
		}
	}
	throw new TypeError(`Unsupported payload type: ${typeof data}`);
}

export async function fromResponse<T>(response: Response): Promise<T> {
	const rawContentType = response.headers.get('content-type') ?? '';
	const contentType = rawContentType.toLowerCase();

	if (!contentType || contentType.includes('json')) {
		if (response.status === 204 || response.status === 205 || response.status === 304) {
			return undefined as T;
		}
		const text = await response.text();
		if (!text.trim()) {
			return undefined as T;
		}
		try {
			return JSON.parse(text) as T;
		} catch (error) {
			if (!contentType) {
				return text as T;
			}
			throw error;
		}
	}

	if (contentType.startsWith('text/')) {
		const text = await response.text();
		if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
			try {
				return JSON.parse(text) as T;
			} catch {
				// Not JSON, return as text
			}
		}
		return text as T;
	}

	return (await response.arrayBuffer()) as T;
}
