import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Note: Svelte 5 support requires investigation - currently fails when built via CLI
// Works when running `bunx vite build` directly
export default defineConfig({
	plugins: [svelte()],
});
