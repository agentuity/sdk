import type { AgentuityConfig } from '@agentuity/cli';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const config: AgentuityConfig = {
	workbench: {
		route: '/workbench',
	},
	plugins: [svelte()],
};

export default config;
