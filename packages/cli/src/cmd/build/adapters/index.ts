/**
 * Build Adapter Registry
 *
 * Maps detected framework names to their build adapters.
 * Specific adapters handle framework-specific concerns (e.g., Next.js standalone mode).
 * Frameworks without a specific adapter fall through to the generic adapter.
 */

import type { BuildAdapter } from './types';
import { genericAdapter } from './generic';
import { nextjsAdapter } from './nextjs';

/**
 * Registry of framework-specific build adapters.
 * Frameworks not in this map use the generic adapter.
 */
const adapters: Record<string, BuildAdapter> = {
	nextjs: nextjsAdapter,
};

/**
 * Get the build adapter for a detected framework.
 * Falls back to the generic adapter if no specific one exists.
 */
export function getAdapter(frameworkName: string): BuildAdapter {
	return adapters[frameworkName] ?? genericAdapter;
}

// Re-export types
export type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types';
