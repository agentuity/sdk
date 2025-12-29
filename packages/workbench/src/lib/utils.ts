import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
	const entries = header.split(",").map((entry) => entry.trim());

	for (const entry of entries) {
		const [model, countStr] = entry.split(":").map((s) => s.trim());

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
	// Prioritize import.meta.env for browser/Vite environments
	if (typeof import.meta.env !== "undefined") {
		return import.meta.env[key];
	}

	if (typeof process !== "undefined" && process.env) {
		return process.env[key];
	}

	return undefined;
};

export const buildUrl = (
	base: string,
	path: string,
	subpath?: string,
	query?: URLSearchParams,
): string => {
	path = path.startsWith("/") ? path : `/${path}`;

	let url = base.replace(/\/$/, "") + path;

	if (subpath) {
		subpath = subpath.startsWith("/") ? subpath : `/${subpath}`;

		url += subpath;
	}

	if (query) {
		url += `?${query.toString()}`;
	}

	return url;
};

const tryOrigin = () => {
	if (typeof window !== "undefined") {
		return window.location.origin;
	}
};

export const defaultBaseUrl: string =
	getProcessEnv("NEXT_PUBLIC_AGENTUITY_URL") ||
	getProcessEnv("VITE_AGENTUITY_URL") ||
	getProcessEnv("AGENTUITY_URL") ||
	tryOrigin() ||
	"http://localhost:3500";

type SchemaLike = {
	type?: string | string[];
	properties?: Record<string, unknown>;
	[key: string]: unknown;
};

function generateEmptyValueForSchema(schema: unknown): unknown {
	if (typeof schema === "boolean") {
		return schema ? {} : undefined;
	}

	if (typeof schema !== "object" || schema === null) {
		return "";
	}

	const s = schema as SchemaLike;
	const type = s.type;

	if (Array.isArray(type)) {
		return generateEmptyValueForSchema({ ...s, type: type[0] });
	}

	switch (type) {
		case "string":
			return "";
		case "number":
		case "integer":
			return 0;
		case "boolean":
			return false;
		case "null":
			return null;
		case "array":
			return [];
		case "object": {
			const result: Record<string, unknown> = {};

			if (s.properties) {
				for (const [key, propSchema] of Object.entries(s.properties)) {
					result[key] = generateEmptyValueForSchema(propSchema);
				}
			}

			return result;
		}
		default:
			if (s.properties) {
				const result: Record<string, unknown> = {};

				for (const [key, propSchema] of Object.entries(s.properties)) {
					result[key] = generateEmptyValueForSchema(propSchema);
				}

				return result;
			}

			return "";
	}
}

export function generateTemplateFromSchema(schema?: unknown): string {
	if (!schema) return "{}";

	const template = generateEmptyValueForSchema(schema);

	return JSON.stringify(template, null, 2);
}
