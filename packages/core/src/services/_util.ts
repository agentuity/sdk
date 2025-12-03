import { safeStringify } from '../json';
import type { Body, HttpMethod } from './adapter';
import { ServiceException } from './exception';

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
		return new ServiceException({
			message: body,
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

export async function toPayload(data: unknown): Promise<[Body, string]> {
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
			return [String(data), textContentType];
		case 'number':
			return [String(data), textContentType];
		case 'object': {
			if (data instanceof ArrayBuffer) {
				return [data, binaryContentType];
			}
			if (data instanceof Uint8Array) {
				return [data.buffer as ArrayBuffer, binaryContentType];
			}
			if (data instanceof ReadableStream) {
				return [data, binaryContentType];
			}
			if (data instanceof Promise) {
				return toPayload(await data);
			}
			if (data instanceof Function) {
				return toPayload(data());
			}
			return [safeStringify(data), jsonContentType];
		}
	}
	return ['', textContentType];
}

export async function fromResponse<T>(response: Response): Promise<T> {
	const rawContentType = response.headers.get('content-type') ?? '';
	const contentType = rawContentType.toLowerCase();

	if (!contentType || contentType.includes('json')) {
		return (await response.json()) as T;
	}

	if (contentType.startsWith('text/')) {
		return (await response.text()) as T;
	}

	return (await response.arrayBuffer()) as T;
}
