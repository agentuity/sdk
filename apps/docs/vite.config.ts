import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@mdx-js/rollup';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { defineConfig } from 'vite';
import { join } from 'node:path';
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
		react(),
		tailwindcss(),
	],
	build: {
		rollupOptions: {
			input: join(__dirname, 'src/web/index.html'),
		},
	},
});
