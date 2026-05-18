import agentuity from '@agentuity/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [agentuity(), tailwindcss(), sveltekit()],
	ssr: {
		noExternal: ['pg'],
	},
});
