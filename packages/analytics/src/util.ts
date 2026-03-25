/**
 * Analytics utility functions
 */

import type { GeoLocation } from './types';

/**
 * Generate a unique ID
 */
export function generateId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Safely stringify an object, handling circular references
 */
export function safeStringify(obj: unknown): string {
	if (obj === undefined || obj === null) {
		return '';
	}
	try {
		const seen = new WeakSet();
		return JSON.stringify(obj, (_key, value) => {
			if (typeof value === 'object' && value !== null) {
				if (seen.has(value)) {
					return '[Circular]';
				}
				seen.add(value);
			}
			return value;
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn('[Agentuity Analytics] Failed to stringify:', message);
		return `[unserializable: ${message}]`;
	}
}

/**
 * Strip query string from URL to prevent sensitive data leakage
 */
export function stripQueryString(url: string): string {
	if (!url) return '';
	try {
		const parsed = new URL(url);
		return parsed.origin + parsed.pathname;
	} catch {
		return url.split('?')[0] ?? url;
	}
}

/**
 * Get UTM parameters from URL
 */
export function getUTMParams(): Record<string, string> {
	const params = new URLSearchParams(location.search);
	const utm: Record<string, string> = {};
	for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
		const value = params.get(key);
		if (value) utm[key] = value;
	}
	return utm;
}

/**
 * Get or create visitor ID from localStorage
 */
export function getVisitorId(): string {
	try {
		const stored = localStorage.getItem('agentuity_visitor_id');
		if (stored) return stored;
	} catch {
		// localStorage not available
	}
	const id = 'vid_' + generateId();
	try {
		localStorage.setItem('agentuity_visitor_id', id);
	} catch {
		// localStorage not available
	}
	return id;
}

/**
 * Get cached geo location
 */
export function getCachedGeo(): GeoLocation | null {
	try {
		const cached = sessionStorage.getItem('agentuity_geo');
		if (cached) return JSON.parse(cached);
	} catch {
		// sessionStorage not available
	}
	return null;
}

/**
 * Cache geo location
 */
export function setCachedGeo(geo: GeoLocation): void {
	try {
		sessionStorage.setItem('agentuity_geo', JSON.stringify(geo));
	} catch {
		// sessionStorage not available
	}
}

/**
 * Fetch geo location from service
 */
export async function fetchGeo(): Promise<GeoLocation | null> {
	try {
		const response = await fetch('https://agentuity.sh/location');
		const geo = await response.json();
		setCachedGeo(geo);
		return geo;
	} catch {
		return getCachedGeo();
	}
}
