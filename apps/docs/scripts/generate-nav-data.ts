/**
 * Generate nav-data.ts from the content directory structure.
 *
 * Reads meta.json files and MDX frontmatter to produce the navigation data
 * used by the docs sidebar, search, breadcrumbs, and prev/next navigation.
 *
 * Run: bun run scripts/generate-nav-data.ts
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';

const CONTENT_DIR = join(import.meta.dir, '../src/web/content');
const OUTPUT_FILE = join(import.meta.dir, '../src/web/components/docs/nav-data.ts');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
	title: string;
	url?: string;
	description?: string;
	items?: NavItem[];
}

interface NavSection {
	title: string;
	url?: string;
	items: NavItem[];
	hideItems?: boolean;
}

interface MetaJson {
	title?: string;
	sections?: string[];
	pages?: string[];
}

// ---------------------------------------------------------------------------
// SDK Explorer (hardcoded — demo routes, not content pages)
// ---------------------------------------------------------------------------

const HOME: NavSection = {
	title: 'Home',
	url: '/',
	hideItems: true,
	items: [],
};

const SDK_EXPLORER: NavSection = {
	title: 'SDK Explorer',
	url: '/explorer',
	hideItems: true,
	items: [
		{
			title: 'Hello Agent',
			url: '/demo/hello',
			description: 'Your first agent - send input, get output',
		},
		{
			title: 'Handler Context',
			url: '/demo/handler-context',
			description: "See what's available inside your agent handler",
		},
		{
			title: 'Chat',
			url: '/demo/chat',
			description: 'Conversation memory that persists across messages',
		},
		{
			title: 'KV Storage',
			url: '/demo/key-value',
			description: 'Store and retrieve data by key, with auto-expiration',
		},
		{
			title: 'Vector Search',
			url: '/demo/vector-storage',
			description: 'Find content by meaning, not just keywords',
		},
		{
			title: 'Object Storage',
			url: '/demo/object-storage',
			description: 'Store files with presigned URLs for sharing',
		},
		{
			title: 'AI Gateway',
			url: '/demo/ai-gateway',
			description: 'Use any AI provider with a single API key',
		},
		{
			title: 'Text Stream',
			url: '/demo/streaming',
			description: "Stream responses as they're generated",
		},
		{
			title: 'SSE Stream',
			url: '/demo/sse-stream',
			description: 'Structured streaming with event types and auto-reconnect',
		},
		{
			title: 'Durable Streams',
			url: '/demo/durable-stream',
			description: 'Generate content and get a permanent, shareable URL',
		},
		{
			title: 'Agent Calls',
			url: '/demo/agent-calls',
			description: 'Call agents from routes or other agents',
		},
		{
			title: 'Cron Jobs',
			url: '/demo/cron',
			description: 'Run tasks on a schedule with cron expressions',
		},
		{
			title: 'Model Arena',
			url: '/demo/model-arena',
			description: 'Compare AI models using another AI as judge',
		},
		{
			title: 'Evals',
			url: '/demo/evals',
			description: 'Run evaluations after your agent responds',
		},
	],
};

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		const s = await stat(path);
		return s.isDirectory();
	} catch {
		return false;
	}
}

async function readMetaJson(dirPath: string): Promise<MetaJson> {
	const metaPath = join(dirPath, 'meta.json');
	const raw = await readFile(metaPath, 'utf-8');
	return JSON.parse(raw);
}

async function readFrontmatter(mdxPath: string): Promise<{ title: string; description?: string }> {
	const raw = await readFile(mdxPath, 'utf-8');
	const { data } = matter(raw);
	const shortTitle = typeof data.short_title === 'string' ? data.short_title : undefined;
	const title = typeof data.title === 'string' ? data.title : undefined;
	const description = typeof data.description === 'string' ? data.description : undefined;
	return {
		title: shortTitle || title || 'Untitled',
		description,
	};
}

// ---------------------------------------------------------------------------
// Content processing
// ---------------------------------------------------------------------------

async function processDirectory(dirPath: string, urlPrefix: string): Promise<NavItem[]> {
	const meta = await readMetaJson(dirPath);
	const pages = meta.pages || [];
	const items: NavItem[] = [];

	for (const slug of pages) {
		if (slug === 'index') continue;

		const subDirPath = join(dirPath, slug);
		const mdxPath = join(dirPath, `${slug}.mdx`);

		if (await isDirectory(subDirPath)) {
			const subMeta = await readMetaJson(subDirPath);
			const hasIndex = await fileExists(join(subDirPath, 'index.mdx'));
			const subItems = await processDirectory(subDirPath, `${urlPrefix}/${slug}`);

			const item: NavItem = { title: subMeta.title || slug };
			if (hasIndex) item.url = `${urlPrefix}/${slug}`;
			if (subItems.length > 0) item.items = subItems;
			items.push(item);
		} else if (await fileExists(mdxPath)) {
			const fm = await readFrontmatter(mdxPath);
			const item: NavItem = { title: fm.title, url: `${urlPrefix}/${slug}` };
			if (fm.description) item.description = fm.description;
			items.push(item);
		} else {
			console.warn(`Warning: No directory or .mdx file for "${slug}" in ${dirPath}`);
		}
	}

	return items;
}

// ---------------------------------------------------------------------------
// TypeScript code serialization
// ---------------------------------------------------------------------------

function ind(n: number): string {
	return '\t'.repeat(n);
}

/** Quote a string for TypeScript output. Uses JSON.stringify for standards-compliant escaping
 *  of control characters, then prefers single quotes when possible (Biome convention). */
function quoteStr(s: string): string {
	const json = JSON.stringify(s); // fully escaped, double-quoted
	if (!s.includes("'")) {
		// Convert to single quotes: strip outer `"`, unescape `\"` → `"`, wrap in `'`
		return `'${json.slice(1, -1).replace(/\\"/g, '"')}'`;
	}
	return json;
}

/** Emit a string property, wrapping to a second line if it would exceed 100 visual cols. */
function emitStringProp(key: string, value: string, indent: number): string {
	const quoted = quoteStr(value);
	// Visual width: tabs (each counts as 3) + key + ": " + quoted + ","
	const visualWidth = indent * 3 + key.length + 2 + quoted.length + 1;
	if (visualWidth <= 100) {
		return `${ind(indent)}${key}: ${quoted},\n`;
	}
	return `${ind(indent)}${key}:\n${ind(indent + 1)}${quoted},\n`;
}

function serializeItem(item: NavItem, indent: number): string {
	let out = `${ind(indent)}{\n`;
	out += `${ind(indent + 1)}title: ${quoteStr(item.title)},\n`;
	if (item.url != null) {
		out += `${ind(indent + 1)}url: ${quoteStr(item.url)},\n`;
	}
	if (item.description != null) {
		out += emitStringProp('description', item.description, indent + 1);
	}
	if (item.items && item.items.length > 0) {
		out += `${ind(indent + 1)}items: [\n`;
		for (const child of item.items) {
			out += serializeItem(child, indent + 2);
		}
		out += `${ind(indent + 1)}],\n`;
	}
	out += `${ind(indent)}},\n`;
	return out;
}

function serializeSection(section: NavSection, indent: number): string {
	let out = `${ind(indent)}{\n`;
	out += `${ind(indent + 1)}title: ${quoteStr(section.title)},\n`;
	if (section.url != null) {
		out += `${ind(indent + 1)}url: ${quoteStr(section.url)},\n`;
	}
	if (section.hideItems) {
		out += `${ind(indent + 1)}hideItems: true,\n`;
	}
	out += `${ind(indent + 1)}items: [\n`;
	for (const item of section.items) {
		out += serializeItem(item, indent + 2);
	}
	out += `${ind(indent + 1)}],\n`;
	out += `${ind(indent)}},\n`;
	return out;
}

// ---------------------------------------------------------------------------
// Helper functions (static — included verbatim in generated output)
// ---------------------------------------------------------------------------

const HELPER_FUNCTIONS = `// Recursively search for a nav item by URL
function findItemByUrl(items: NavItem[], url: string): NavItem | undefined {
	for (const item of items) {
		if (item.url === url) {
			return item;
		}
		if (item.items) {
			const found = findItemByUrl(item.items, url);
			if (found) return found;
		}
	}
	return undefined;
}

// Helper to find current nav item and section
export function findCurrentNav(currentPage: string): { section?: NavSection; item?: NavItem } {
	const url = currentPage === 'home' ? '/' : \`/\${currentPage}\`;
	for (const section of navData) {
		// Check section URL
		if (section.url === url) {
			return { section };
		}
		// Check items recursively
		const item = findItemByUrl(section.items, url);
		if (item) {
			return { section, item };
		}
	}
	return {};
}

// Recursively collect all leaf nav items (items with URLs, no sub-items or sub-items without URLs)
function collectLeafItems(
	items: NavItem[],
	sectionTitle: string
): Array<NavItem & { section: string }> {
	const result: Array<NavItem & { section: string }> = [];
	for (const item of items) {
		// If item has a URL, it's navigable
		if (item.url) {
			result.push({ ...item, url: item.url, section: sectionTitle });
		}
		// Also recurse into nested items
		if (item.items) {
			result.push(...collectLeafItems(item.items, sectionTitle));
		}
	}
	return result;
}

// Get flat list of all nav items for prev/next navigation
export function getAllNavItems(): Array<NavItem & { section: string; url: string }> {
	const items: Array<NavItem & { section: string; url: string }> = [];
	for (const section of navData) {
		items.push(
			...(collectLeafItems(section.items, section.title) as Array<
				NavItem & { section: string; url: string }
			>)
		);
	}
	return items;
}

// Helper to find prev/next pages
export function findPrevNext(currentPage: string): {
	prev?: NavItem & { section: string; url: string };
	next?: NavItem & { section: string; url: string };
} {
	const allItems = getAllNavItems();
	const url = currentPage === 'home' ? '/' : \`/\${currentPage}\`;
	const currentIndex = allItems.findIndex((item) => item.url === url);

	if (currentIndex === -1) {
		return {};
	}

	return {
		prev: currentIndex > 0 ? allItems[currentIndex - 1] : undefined,
		next: currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : undefined,
	};
}

// Find the full breadcrumb chain from root section to current page
export function findBreadcrumbChain(currentPage: string): Array<{ title: string; url?: string }> {
	const url = currentPage === 'home' ? '/' : \`/\${currentPage}\`;

	// Home page — no breadcrumbs
	if (url === '/') return [];

	for (const section of navData) {
		// Check if this is the section index page
		if (section.url === url) {
			return [{ title: section.title, url: section.url }];
		}

		// Recursively search items, accumulating ancestors
		const chain = findChainInItems(section.items, url, [
			{ title: section.title, url: section.url },
		]);
		if (chain) return chain;
	}

	return [];
}

// Recursive helper — searches NavItem[] for a matching URL, building up the ancestor chain
function findChainInItems(
	items: NavItem[],
	targetUrl: string,
	ancestors: Array<{ title: string; url?: string }>
): Array<{ title: string; url?: string }> | null {
	for (const item of items) {
		if (item.url === targetUrl) {
			return [...ancestors, { title: item.title, url: item.url }];
		}
		if (item.items) {
			const chain = findChainInItems(item.items, targetUrl, [
				...ancestors,
				{ title: item.title, url: item.url },
			]);
			if (chain) return chain;
		}
	}
	return null;
}

// Check if any item in the tree is active (matches current URL)
export function hasActiveChild(items: NavItem[], currentUrl: string): boolean {
	for (const item of items) {
		if (item.url === currentUrl) return true;
		if (item.items && hasActiveChild(item.items, currentUrl)) return true;
	}
	return false;
}
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const rootMeta = await readMetaJson(CONTENT_DIR);
	const sectionSlugs = rootMeta.sections || [];
	const sections: NavSection[] = [HOME, SDK_EXPLORER];

	for (const slug of sectionSlugs) {
		const sectionDir = join(CONTENT_DIR, slug);
		const sectionMeta = await readMetaJson(sectionDir);
		const hasIndex = await fileExists(join(sectionDir, 'index.mdx'));
		const items = await processDirectory(sectionDir, `/${slug}`);

		const section: NavSection = { title: sectionMeta.title || slug, items };
		if (hasIndex) section.url = `/${slug}`;
		sections.push(section);
	}

	// Build output
	let output = '// Auto-generated by scripts/generate-nav-data.ts \u2014 DO NOT EDIT\n\n';

	output += `export interface NavItem {\n`;
	output += `\ttitle: string;\n`;
	output += `\turl?: string;\n`;
	output += `\tisActive?: boolean;\n`;
	output += `\t/** Short description from MDX frontmatter, used in search results */\n`;
	output += `\tdescription?: string;\n`;
	output += `\t/** Nested items for subsections */\n`;
	output += `\titems?: NavItem[];\n`;
	output += `}\n\n`;

	output += `export interface NavSection {\n`;
	output += `\ttitle: string;\n`;
	output += `\turl?: string;\n`;
	output += `\titems: NavItem[];\n`;
	output += `\t/** If true, items are hidden from sidebar but still used for breadcrumb/search */\n`;
	output += `\thideItems?: boolean;\n`;
	output += `}\n\n`;

	output += `export const navData: NavSection[] = [\n`;
	for (const section of sections) {
		output += serializeSection(section, 1);
	}
	output += `];\n\n`;

	output += HELPER_FUNCTIONS;

	await Bun.write(OUTPUT_FILE, output);

	// Summary
	const totalItems = sections.reduce((acc, s) => acc + countItems(s.items), 0);
	console.log(`Generated nav-data.ts \u2014 ${sections.length} sections, ${totalItems} items`);
}

function countItems(items: NavItem[]): number {
	let count = items.length;
	for (const item of items) {
		if (item.items) count += countItems(item.items);
	}
	return count;
}

main().catch((err) => {
	console.error('Error generating nav-data:', err);
	process.exit(1);
});
