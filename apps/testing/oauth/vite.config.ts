import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { join } from 'node:path';

export default defineConfig({
	plugins: [react()],
	root: '.',
	build: {
		rollupOptions: {
			input: join(__dirname, 'src/web/index.html'),
		},
	},
});
