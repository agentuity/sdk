import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@mdx-js/rollup';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import remarkCodeImport from 'remark-code-import';
import rehypePrettyCode from 'rehype-pretty-code';
import {
	transformerNotationHighlight,
	transformerNotationFocus,
	transformerNotationDiff,
} from '@shikijs/transformers';
import rehypeSlug from 'rehype-slug';
import rehypeExtractToc from '@stefanprobst/rehype-extract-toc';
import rehypeExtractTocExport from '@stefanprobst/rehype-extract-toc/mdx';
import rehypeMermaid from 'rehype-mermaid';

export default defineConfig({
	root: '.',
	// Empty base emits CDN-relative asset URLs, so lazily-loaded route chunks
	// resolve against the CDN-hosted entry script instead of the app origin.
	// Required for the transformAssets CDN rewrite in src/web/server.ts. Do not
	// set to '/' or lazy chunks will 404 against the CDN in production.
	base: '',
	publicDir: 'src/web/public',
	plugins: [
		tanstackStart({
			srcDirectory: 'src/web',
			router: {
				routesDirectory: 'routes',
				generatedRouteTree: 'routeTree.gen.ts',
				quoteStyle: 'single',
			},
		}),
		// MDX must run before React so Vite does not hand raw .mdx files to the JSX transform.
		{
			enforce: 'pre',
			...mdx({
				remarkPlugins: [
					remarkFrontmatter,
					remarkMdxFrontmatter,
					remarkGfm,
					[remarkCodeImport, { rootDir: process.cwd() }],
				],
				rehypePlugins: [
					rehypeSlug,
					rehypeExtractToc,
					rehypeExtractTocExport,
					[rehypeMermaid, { strategy: 'img-svg' }],
					[
						rehypePrettyCode,
						{
							theme: {
								dark: 'github-dark',
								light: 'github-light',
							},
							keepBackground: false,
							transformers: [
								transformerNotationHighlight(),
								transformerNotationFocus(),
								transformerNotationDiff(),
							],
						},
					],
				],
				providerImportSource: '@mdx-js/react',
			}),
		},
		react(),
		tailwindcss(),
	],
	server: {
		proxy: {
			'^/api(?:/|$)': {
				target: 'http://127.0.0.1:3001',
				changeOrigin: true,
				ws: true,
			},
		},
	},
	ssr: {
		external: ['bun'],
	},
	build: {
		rollupOptions: {
			external: ['bun'],
		},
	},
});
