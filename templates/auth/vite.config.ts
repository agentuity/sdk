import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { join } from 'node:path';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	root: '.',
	// Files in src/web/public/ are served at the URL root (/favicon.ico,
	// /robots.txt, ...). See AGENTS.md for the full convention
	publicDir: 'src/web/public',
	build: {
		rollupOptions: {
			input: join(import.meta.dirname, 'src/web/index.html'),
		},
	},
});
