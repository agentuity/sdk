/**
 * Generate static markdown files from MDX content for LLM consumption.
 *
 * Creates:
 * - Individual .md files at src/web/public/{path}.md
 * - llms.txt - Index with links to all docs
 * - llms-full.txt - Full content embedded
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, relative, basename } from 'node:path';
import matter from 'gray-matter';

const BASE_URL = 'https://agentuity.dev';
const CONTENT_DIR = join(import.meta.dir, '../src/web/content');
const OUTPUT_DIR = join(import.meta.dir, '../src/web/public');

interface DocPage {
	title: string;
	description: string;
	urlPath: string;
	mdPath: string;
	content: string;
}

async function getAllMdxFiles(dir: string): Promise<string[]> {
	const files: string[] = [];

	async function scan(currentDir: string) {
		const entries = await readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await scan(fullPath);
			} else if (entry.name.endsWith('.mdx')) {
				files.push(fullPath);
			}
		}
	}

	await scan(dir);
	return files;
}

function mdxPathToUrlPath(mdxPath: string): string {
	const rel = relative(CONTENT_DIR, mdxPath);
	// Remove .mdx extension
	let urlPath = rel.replace(/\.mdx$/, '');
	// Handle index files: agents/index -> agents
	if (urlPath.endsWith('/index')) {
		urlPath = urlPath.slice(0, -6);
	} else if (urlPath === 'index') {
		urlPath = '';
	}
	return '/' + urlPath;
}

function urlPathToMdOutputPath(urlPath: string): string {
	// /agents/creating-agents -> agents/creating-agents.md
	// /agents -> agents.md
	// /services/storage -> services/storage.md
	const cleaned = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
	if (cleaned === '') {
		return 'index.md';
	}
	return cleaned + '.md';
}

async function processFile(mdxPath: string): Promise<DocPage> {
	const raw = await readFile(mdxPath, 'utf-8');
	const { data, content } = matter(raw);

	const title = data.title || 'Untitled';
	const description = data.description || '';
	const urlPath = mdxPathToUrlPath(mdxPath);
	const mdPath = urlPathToMdOutputPath(urlPath);

	// Transform content: prepend title and description
	const markdownContent = `# ${title}

${description}

${content.trim()}`;

	return {
		title,
		description,
		urlPath,
		mdPath,
		content: markdownContent,
	};
}

async function ensureDir(filePath: string) {
	const dir = dirname(filePath);
	await mkdir(dir, { recursive: true });
}

async function main() {
	const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

	const mdxFiles = await getAllMdxFiles(CONTENT_DIR);
	const pages: DocPage[] = [];

	for (const mdxPath of mdxFiles) {
		const page = await processFile(mdxPath);
		pages.push(page);

		// Write individual .md file
		const outputPath = join(OUTPUT_DIR, page.mdPath);
		await ensureDir(outputPath);
		await writeFile(outputPath, page.content, 'utf-8');
		if (verbose) {
			console.log(`  ${page.mdPath}`);
		}
	}

	// Sort pages alphabetically by URL path for consistent ordering
	pages.sort((a, b) => a.urlPath.localeCompare(b.urlPath));

	// Generate llms.txt
	const llmsTxt = generateLlmsTxt(pages);
	await writeFile(join(OUTPUT_DIR, 'llms.txt'), llmsTxt, 'utf-8');

	// Generate llms-full.txt
	const llmsFullTxt = generateLlmsFullTxt(pages);
	await writeFile(join(OUTPUT_DIR, 'llms-full.txt'), llmsFullTxt, 'utf-8');

	console.log(`Generated ${pages.length} markdown files + llms.txt + llms-full.txt`);
}

function generateLlmsTxt(pages: DocPage[]): string {
	const preamble = `# Agentuity SDK Documentation

## About

Agentuity is a TypeScript SDK for building AI agents with automatic schema validation, built-in storage, and seamless deployment.

## Capabilities

The documentation covers:
- General cloud and account information
- CLI usage and commands
- SDK integration
- Examples, tutorials, and sample implementations
- Troubleshooting and best practices

## Limitations

- The documentation primarily focuses on Agentuity services and may not cover all aspects of AI agent development
- Some advanced features may require additional knowledge of AI frameworks
- Examples are provided for common use cases but may need adaptation for specific requirements

## Documentation Pages

`;

	const links = pages.map((page) => `[${page.title}](${BASE_URL}${page.urlPath}.md)`).join('\n');

	return preamble + links + '\n';
}

function generateLlmsFullTxt(pages: DocPage[]): string {
	const preamble = `# Agentuity SDK Documentation

## About

Agentuity is a TypeScript SDK for building AI agents with automatic schema validation, built-in storage, and seamless deployment.

## Capabilities

The documentation covers:
- General cloud and account information
- CLI usage and commands
- SDK integration
- Examples, tutorials, and sample implementations
- Troubleshooting and best practices

## Limitations

- The documentation primarily focuses on Agentuity services and may not cover all aspects of AI agent development
- Some advanced features may require additional knowledge of AI frameworks
- Examples are provided for common use cases but may need adaptation for specific requirements

---

`;

	const sections = pages
		.map((page) => {
			return `## ${page.title}

URL: ${BASE_URL}${page.urlPath}

${page.description}

${page.content.replace(/^# .+\n\n.+\n\n/, '')}

---`;
		})
		.join('\n\n');

	return preamble + sections + '\n';
}

main().catch((err) => {
	console.error('Error generating markdown files:', err);
	process.exit(1);
});
