import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
	plugins: [devtools(), viteReact(), tailwindcss()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
			'@agentuity/routes': fileURLToPath(
				new URL('./agentuity/src/generated/routes.ts', import.meta.url)
			),
			'@agentuity/react': fileURLToPath(new URL('../../../packages/react', import.meta.url)),
			'@agentuity/core': fileURLToPath(new URL('../../../packages/core', import.meta.url)),
			'@agentuity/frontend': fileURLToPath(
				new URL('../../../packages/frontend', import.meta.url)
			),
		},
	},
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:3500',
				changeOrigin: true,
			},
		},
	},
});
