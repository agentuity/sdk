/**
 * Pre-build content pipeline for the docs site.
 *
 * Creates:
 * - Individual .md files at src/web/public/{path}.md
 * - llms.txt - Index with links to all docs
 * - llms-full.txt - Full content embedded
 * - sitemap.xml - SEO sitemap
 * - search-index.json - Content-aware search index for Cmd+K keyword search
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import matter from 'gray-matter';
import GithubSlugger from 'github-slugger';
import { navData } from '../src/web/components/docs/nav-data';

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

interface SearchEntry {
	id: string;
	title: string;
	pageTitle: string;
	section: string;
	url: string;
	searchText: string;
	snippet: string;
	isPageLevel: boolean;
}

interface SearchIndexV1 {
	version: 1;
	entries: SearchEntry[];
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

// Build a map from URL path to nav section name
function buildUrlToSectionMap(): Map<string, string> {
	const map = new Map<string, string>();
	for (const section of navData) {
		if (section.url) map.set(section.url, section.title);
		function addItems(items: { url?: string; items?: typeof items }[]) {
			for (const item of items) {
				if (item.url) map.set(item.url, section.title);
				if (item.items) addItems(item.items);
			}
		}
		addItems(section.items);
	}
	return map;
}

function getSectionForUrl(urlPath: string, urlSectionMap: Map<string, string>): string {
	if (urlSectionMap.has(urlPath)) return urlSectionMap.get(urlPath)!;
	// Fallback: capitalize the first URL segment
	const segment = urlPath.split('/').filter(Boolean)[0];
	if (!segment) return 'Documentation';
	return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function sanitizeContent(text: string): string {
	return (
		text
			// Strip code fence markers but keep content inside, capped per block
			.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) => {
				const trimmed = code.trim();
				return trimmed.length > 300 ? trimmed.slice(0, 300) : trimmed;
			})
			// Remove JSX/MDX self-closing tags
			.replace(/<[A-Z]\w*[^>]*\/>/g, '')
			// Remove JSX/MDX opening and closing tags (keep text between)
			.replace(/<\/?[A-Z]\w*[^>]*>/g, '')
			// Remove orphaned self-closing markers from nested JSX (e.g., "} />", "/>", "</>")
			.replace(/<\/>/g, '')
			.replace(/\}?\s*\/>/g, '')
			// Remove HTML tags
			.replace(/<\/?[a-z][\w-]*[^>]*>/g, '')
			// Remove import statements
			.replace(/^import\s+.+$/gm, '')
			// Remove export statements
			.replace(/^export\s+.+$/gm, '')
			// Remove inline code backticks (keep the text)
			.replace(/`([^`]*)`/g, '$1')
			// Remove markdown image syntax (must run before link removal)
			.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
			// Remove markdown link syntax, keep text
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
			// Remove markdown bold/italic markers
			.replace(/\*{1,2}([^*]*)\*{1,2}/g, '$1')
			// Remove heading markers
			.replace(/^#{1,6}\s+/gm, '')
			// Remove markdown table separator rows
			.replace(/^\|[-:\s|]+\|$/gm, '')
			// Strip markdown table pipe characters
			.replace(/\|/g, ' ')
			// Remove horizontal rules
			.replace(/^---+$/gm, '')
			// Collapse whitespace
			.replace(/\s+/g, ' ')
			.trim()
	);
}

function truncateAtWord(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	const truncated = text.slice(0, maxLength);
	const lastSpace = truncated.lastIndexOf(' ');
	return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

function extractSections(page: DocPage, urlSectionMap: Map<string, string>): SearchEntry[] {
	const entries: SearchEntry[] = [];
	const section = getSectionForUrl(page.urlPath, urlSectionMap);
	const slug = page.urlPath.replace(/^\//, '').replace(/\//g, '-') || 'index';
	const slugger = new GithubSlugger();

	// Page-level entry: searchText is always the full sanitized body
	const fullSearchText = truncateAtWord(sanitizeContent(page.content), 3000);
	const pageSnippet = page.description
		? page.description
		: truncateAtWord(fullSearchText, 200);

	entries.push({
		id: slug,
		title: page.title,
		pageTitle: page.title,
		section,
		url: page.urlPath,
		searchText: fullSearchText,
		snippet: pageSnippet,
		isPageLevel: true,
	});

	// Parse H2 and H3 headings from raw content
	const lines = page.content.split('\n');
	const headings: Array<{ level: number; text: string; startLine: number }> = [];

	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(/^(#{2,3})\s+(.+)$/);
		if (match) {
			headings.push({
				level: match[1].length,
				text: match[2].trim(),
				startLine: i,
			});
		}
	}

	for (let i = 0; i < headings.length; i++) {
		const heading = headings[i];
		const nextHeadingLine = i + 1 < headings.length ? headings[i + 1].startLine : lines.length;
		const bodyLines = lines.slice(heading.startLine + 1, nextHeadingLine);
		const rawBody = bodyLines.join('\n');
		const sectionSearchText = sanitizeContent(rawBody);

		if (!sectionSearchText) continue;

		// Snippet uses prose only (code blocks stripped); code-only sections show no snippet
		const proseOnly = sanitizeContent(rawBody.replace(/```[\s\S]*?```/g, ''));
		const snippet = proseOnly ? truncateAtWord(proseOnly, 200) : '';

		const anchor = slugger.slug(heading.text);

		entries.push({
			id: `${slug}__${anchor}`,
			title: heading.text,
			pageTitle: page.title,
			section,
			url: `${page.urlPath}#${anchor}`,
			searchText: sectionSearchText,
			snippet,
			isPageLevel: false,
		});
	}

	// Deduplicate: if page description overlaps significantly with first section snippet, drop the section entry
	if (entries.length > 1 && page.description) {
		const descSnippet = sanitizeContent(page.description).slice(0, 80);
		if (descSnippet && entries[1].snippet.startsWith(descSnippet)) {
			entries.splice(1, 1);
		}
	}

	return entries;
}

function generateSearchIndex(pages: DocPage[]): SearchIndexV1 {
	const urlSectionMap = buildUrlToSectionMap();
	const entries: SearchEntry[] = [];

	for (const page of pages) {
		entries.push(...extractSections(page, urlSectionMap));
	}

	return {
		version: 1,
		entries,
	};
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

	// Generate sitemap.xml
	const sitemapXml = generateSitemapXml(pages);
	await writeFile(join(OUTPUT_DIR, 'sitemap.xml'), sitemapXml, 'utf-8');

	// Generate search-index.json
	const searchIndex = generateSearchIndex(pages);
	await writeFile(
		join(OUTPUT_DIR, 'search-index.json'),
		JSON.stringify(searchIndex),
		'utf-8'
	);

	console.log(
		`Generated ${pages.length} markdown files + llms.txt + llms-full.txt + sitemap.xml + search-index.json (${searchIndex.entries.length} search entries)`
	);
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

function generateSitemapXml(pages: DocPage[]): string {
	const DOCS_BASE = 'https://agentuity.com/docs';
	const today = new Date().toISOString().split('T')[0];

	const urls = pages
		.map((page) => {
			const loc = page.urlPath === '/' ? DOCS_BASE : `${DOCS_BASE}${page.urlPath}`;
			return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`;
		})
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

main().catch((err) => {
	console.error('Error generating markdown files:', err);
	process.exit(1);
});
