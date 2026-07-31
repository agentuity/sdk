/**
 * Nuxt build adapter — CDN `app.cdnURL` then generic build.
 */

import { withCdnPrep } from './with-cdn-prep.ts';
import { prepareNuxtCdnBuild } from './cdn-recipes.ts';

export const nuxtAdapter = withCdnPrep({
	name: 'nuxt',
	prepare: prepareNuxtCdnBuild,
});
