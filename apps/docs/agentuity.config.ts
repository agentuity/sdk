/**
 * Agentuity Configuration
 *
 */

import type { AgentuityConfig } from '@agentuity/cli';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import mdx from '@mdx-js/rollup';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import rehypeExtractToc from '@stefanprobst/rehype-extract-toc';
import rehypeExtractTocExport from '@stefanprobst/rehype-extract-toc/mdx';

export default {
	/**
	 * Workbench (development only)
	 *
	 * Visual UI for testing agents during development. Not included in production builds.
	 * Omit this section to disable. Access at http://localhost:3500/workbench
	 */
	workbench: {
		route: '/workbench',
		headers: {},
	},

	/**
	 * Vite Plugins
	 *
	 * Custom Vite plugins for the client build (src/web/).
	 * Added after built-in plugins: React, browserEnvPlugin, patchPlugin
	 *
	 * Example (Tailwind CSS):
	 *   bun add -d tailwindcss @tailwindcss/vite
	 *   import tailwindcss from '@tailwindcss/vite';
	 *   plugins: [tailwindcss()]
	 *
	 * @see https://vitejs.dev/plugins/
	 */
	plugins: [
		// TanStack Router for file-based routing
		tanstackRouter({
			target: 'react',
			routesDirectory: './src/web/routes',
			generatedRouteTree: './src/web/routeTree.gen.ts',
			quoteStyle: 'single',
			autoCodeSplitting: false,
		}),
		// MDX support with GitHub Flavored Markdown + Shiki syntax highlighting
		mdx({
			remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm],
			rehypePlugins: [
				rehypeSlug,
				rehypeExtractToc,
				rehypeExtractTocExport,
				[
					rehypePrettyCode,
					{
						theme: {
							dark: 'github-dark',
							light: 'github-light',
						},
						keepBackground: false,
					},
				],
			],
			providerImportSource: '@mdx-js/react',
		}),
		tailwindcss(),
	],
} satisfies AgentuityConfig;
