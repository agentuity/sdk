import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Parses the x-agentuity-tokens header string into a Record of model names to token counts.
 * Format: "model1:count1, model2:count2" or "model1:count1"
 * @param header - The x-agentuity-tokens header string
 * @returns Record mapping model names to token counts
 */
export function parseTokensHeader(header: string): Record<string, number> {
	const result: Record<string, number> = {};

	// Split by comma and trim each entry
	const entries = header.split(',').map((entry) => entry.trim());

	for (const entry of entries) {
		const [model, countStr] = entry.split(':').map((s) => s.trim());
		if (model && countStr) {
			const count = Number.parseInt(countStr, 10);
			if (!Number.isNaN(count)) {
				result[model] = count;
			}
		}
	}

	return result;
}

/**
 * Calculates the total number of tokens from a parsed tokens record.
 * @param tokens - Record mapping model names to token counts
 * @returns Total number of tokens
 */
export function getTotalTokens(tokens: Record<string, number>): number {
	return Object.keys(tokens).reduce((sum, key) => sum + tokens[key], 0);
}

export const getProcessEnv = (key: string): string | undefined => {
	if (typeof process !== 'undefined' && process.env) {
		return process.env[key];
	}
	if (typeof import.meta.env !== 'undefined') {
		return import.meta.env[key];
	}
	return undefined;
};

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

const tryOrigin = () => {
	if (typeof window !== 'undefined') {
		return window.location.origin;
	}
};

export const defaultBaseUrl: string =
	getProcessEnv('NEXT_PUBLIC_AGENTUITY_URL') ||
	getProcessEnv('VITE_AGENTUITY_URL') ||
	getProcessEnv('AGENTUITY_URL') ||
	tryOrigin() ||
	'http://localhost:3500';
