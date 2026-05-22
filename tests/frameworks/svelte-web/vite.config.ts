import agentuity from '@agentuity/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [agentuity(), sveltekit()],
});
