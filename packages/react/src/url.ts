import { getProcessEnv } from './env';

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
		url += `/${subpath}`;
	}
	if (query) {
		url += `?${query.toString()}`;
	}
	return url;
};

export const defaultBaseUrl: string =
	getProcessEnv('NEXT_PUBLIC_AGENTUITY_URL') ||
	getProcessEnv('VITE_AGENTUITY_URL') ||
	getProcessEnv('AGENTUITY_URL') ||
	'http://localhost:3500';
