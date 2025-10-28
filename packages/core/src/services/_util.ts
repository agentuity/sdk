import { safeStringify } from '../json';
import type { Body } from './adapter';
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

export async function toServiceException(response: Response): Promise<ServiceException> {
	switch (response.status) {
		case 401:
		case 403:
			return new ServiceException('Unauthorized', response.status);
		case 404:
			return new ServiceException('Not Found', response.status);
		default:
	}
	const ct = response.headers.get('content-type');
	if (ct?.includes('json')) {
		try {
			const payload = (await response.json()) as { message?: string; error?: string };
			if (payload.error) {
				return new ServiceException(payload.error, response.status);
			}
			if (payload.message) {
				return new ServiceException(payload.message, response.status);
			}
			return new ServiceException(JSON.stringify(payload), response.status);
		} catch {
			/** don't worry */
		}
	}
	try {
		const body = await response.text();
		return new ServiceException(body, response.status);
	} catch {
		/* fall through */
	}

	return new ServiceException(response.statusText, response.status);
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
			if (data instanceof Buffer) {
				return [data, binaryContentType];
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
	const contentType = response.headers.get('content-type');
	if (!contentType || contentType?.includes('/json')) {
		return (await response.json()) as T;
	}
	if (contentType?.includes('text/')) {
		return (await response.text()) as T;
	}
	if (contentType?.includes(binaryContentType)) {
		return (await response.arrayBuffer()) as T;
	}
	throw new ServiceException(`Unsupported content-type: ${contentType}`, response.status);
}
