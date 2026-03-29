import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { join } from 'node:path';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	root: '.',
	build: {
		rollupOptions: {
			input: join(__dirname, 'src/web/index.html'),
		},
	},
});
