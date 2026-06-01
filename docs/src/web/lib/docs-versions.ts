/**
 * Single source of truth for documentation versions.
 *
 * The version picker (sidebar header) and the legacy-docs link (sidebar footer)
 * both read from here, so the v2 URL and labels live in one place for launch.
 */

export const DOCS_VERSIONS = {
	v3: { url: 'https://agentuity.dev/', label: 'Latest · v3' },
	v2: { url: 'https://v2.agentuity.dev/', label: 'Legacy · v2' },
} as const;

export type DocsVersion = keyof typeof DOCS_VERSIONS;

// Resolve the active version from the hostname. Defaults to v3 on the server
// (and on any host that isn't the v2 docs) so SSR and hydration agree.
export function getCurrentVersion(): DocsVersion {
	if (typeof window === 'undefined') return 'v3';
	return window.location.hostname === 'v2.agentuity.dev' ? 'v2' : 'v3';
}

export function isDocsVersion(value: string): value is DocsVersion {
	return value === 'v2' || value === 'v3';
}
