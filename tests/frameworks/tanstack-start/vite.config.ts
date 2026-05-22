import agentuity from '@agentuity/vite';
import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import { nitro } from 'nitro/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';

import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const config = defineConfig({
	plugins: [
		agentuity(),
		devtools(),
		tsconfigPaths({ projects: ['./tsconfig.json'] }),
		tailwindcss(),
		tanstackStart(),
		nitro(),
		viteReact(),
	],
});

export default config;
