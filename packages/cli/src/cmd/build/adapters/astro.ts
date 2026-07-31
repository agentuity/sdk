/**
 * Astro build adapter — CDN `build.assetsPrefix` then generic build.
 */

import { withCdnPrep } from './with-cdn-prep.ts';
import { prepareAstroCdnBuild } from './cdn-recipes.ts';

export const astroAdapter = withCdnPrep({
	name: 'astro',
	prepare: prepareAstroCdnBuild,
});
