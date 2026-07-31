/**
 * SvelteKit build adapter — adapter-node swap + CDN `kit.paths.assets`,
 * then generic build (buildFileReplacements cleared; owned by recipe prePatch).
 */

import { withCdnPrep } from './with-cdn-prep.ts';
import { prepareSvelteKitCdnBuild } from './cdn-recipes.ts';

export const sveltekitAdapter = withCdnPrep({
	name: 'sveltekit',
	prepare: prepareSvelteKitCdnBuild,
	frameworkOverrides: () => ({
		// Adapter-auto → adapter-node runs in recipe.prePatch so it composes
		// with the CDN wrap; do not re-apply via generic buildFileReplacements.
		buildFileReplacements: [],
	}),
});
