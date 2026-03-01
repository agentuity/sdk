import rsc from '@vitejs/plugin-rsc';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
	plugins: [
		rsc({
			entries: {
				rsc: './src/framework/entry.rsc.tsx',
				ssr: './src/framework/entry.ssr.tsx',
				client: './src/framework/entry.browser.tsx',
			},
		}),
	],
	optimizeDeps: {
		include: [
			'react',
			'react-dom',
			'react-dom/client',
			'react/jsx-runtime',
			'react/jsx-dev-runtime',
		],
	},
	resolve: {
		alias: {
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
				target: 'http://localhost:3502',
				changeOrigin: true,
			},
		},
	},
});
