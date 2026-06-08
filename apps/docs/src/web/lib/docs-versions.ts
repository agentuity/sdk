/**
 * Single source of truth for documentation versions.
 *
 * The sidebar picker and legacy-docs callouts both use these URLs so launch
 * routing stays consistent between the v2 and v3 docs apps.
 */

export const DOCS_VERSIONS = {
	v3: { url: 'https://agentuity.dev/', label: 'Latest · v3' },
	v2: { url: 'https://v2.agentuity.dev/', label: 'Legacy · v2' },
} as const;

export type DocsVersion = keyof typeof DOCS_VERSIONS;

// v2 docs are deployed on v2.agentuity.dev and default to v2 during local dev.
export function getCurrentVersion(): DocsVersion {
	if (typeof window === 'undefined') return 'v2';
	return window.location.hostname === 'agentuity.dev' ? 'v3' : 'v2';
}

export function isDocsVersion(value: string): value is DocsVersion {
	return value === 'v2' || value === 'v3';
}
