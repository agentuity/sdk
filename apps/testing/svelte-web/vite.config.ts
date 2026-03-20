import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { join } from 'node:path';

export default defineConfig({
	plugins: [svelte()],
	root: '.',
	build: {
		rollupOptions: {
			input: join(__dirname, 'src/web/index.html'),
		},
	},
});
