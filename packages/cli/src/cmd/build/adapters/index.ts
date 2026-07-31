/**
 * Build Adapter Registry
 *
 * Maps detected framework names to their build adapters.
 * Specific adapters handle framework-specific concerns (e.g., Next.js standalone mode).
 * Frameworks without a specific adapter fall through to the generic adapter.
 */

import type { BuildAdapter } from './types.ts';
import { astroAdapter } from './astro.ts';
import { genericAdapter } from './generic.ts';
import { nextjsAdapter } from './nextjs.ts';
import { nuxtAdapter } from './nuxt.ts';
import { sveltekitAdapter } from './sveltekit.ts';
import { tanstackStartAdapter } from './tanstack-start.ts';
import { viteAdapter } from './vite.ts';

/**
 * Registry of framework-specific build adapters.
 * Frameworks not in this map use the generic adapter.
 */
const adapters: Record<string, BuildAdapter> = {
	astro: astroAdapter,
	nextjs: nextjsAdapter,
	nuxt: nuxtAdapter,
	sveltekit: sveltekitAdapter,
	'tanstack-start': tanstackStartAdapter,
	vite: viteAdapter,
};

/**
 * Get the build adapter for a detected framework.
 * Falls back to the generic adapter if no specific one exists.
 */
export function getAdapter(frameworkSlug: string): BuildAdapter {
	return adapters[frameworkSlug] ?? genericAdapter;
}

// Re-export types
export type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types.ts';
