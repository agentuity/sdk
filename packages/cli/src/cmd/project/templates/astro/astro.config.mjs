// @ts-check
// Configured by `agentuity project create` to deploy on the
// Agentuity Cloud's Node container runtime via Astro's `@astrojs/node`
// adapter in `standalone` mode (a self-listening Node server at
// `dist/server/entry.mjs`). Without `output: 'server'` Astro builds
// a static SPA that doesn't run any user-side server code.
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	output: 'server',
	adapter: node({
		mode: 'standalone',
	}),
	vite: {
		plugins: [tailwindcss()],
		ssr: {
			noExternal: ['pg'],
		},
	},
});
