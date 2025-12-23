import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
	root: __dirname,
	plugins: [react(), tailwindcss()],

	resolve: {
		alias: {
			// Point @agentuity/core to the local package source
			'@agentuity/core': resolve(__dirname, '../../core/src'),
			'@agentuity/core/workbench': resolve(__dirname, '../../core/src/workbench-config'),
		},
	},

	// Tailwind needs to find content in src/
	css: {
		postcss: {
			plugins: [],
		},
	},

	server: {
		port: 5174,
		// Proxy API calls to integration-suite
		proxy: {
			'/_agentuity': {
				target: 'http://127.0.0.1:3500',
				changeOrigin: true,
			},
		},
		// Watch parent src directory for changes
		watch: {
			ignored: ['!**/src/**'],
		},
	},

	// Env prefix for AGENTUITY_PUBLIC_* vars
	envPrefix: ['VITE_', 'AGENTUITY_PUBLIC_'],

	// Define environment variables for test app
	define: {
		'import.meta.env.AGENTUITY_PUBLIC_HAS_SDK_KEY': JSON.stringify('true'),
	},
});
