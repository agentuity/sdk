/**
 * Generate static markdown files from MDX content for LLM consumption.
 *
 * Creates:
 * - Individual .md files at src/web/public/{path}.md
 * - llms.txt - Index with links to all docs
 * - llms-full.txt - Full content embedded
 */

import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import matter from 'gray-matter';
import { navData, type NavItem } from '../src/web/components/docs/nav-data.ts';

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

/**
 * Transform MDX component syntax into clean markdown.
 *
 * Callouts are processed first on the full content because they can wrap
 * fenced code blocks. All other transforms run only on non-code segments
 * to avoid mangling code examples.
 */
function transformMDXtoMarkdown(content: string): string {
	// Phase 1: Transform Callouts on the full content (they can span code blocks)
	const result = transformCallouts(content);

	// Phase 2: Split into code-block / non-code segments for remaining transforms
	const segments: { text: string; isCode: boolean }[] = [];
	const codeBlockPattern = /^(`{3,})[^\n]*\n[\s\S]*?\n\1\s*$/gm;
	let lastIndex = 0;

	for (const match of result.matchAll(codeBlockPattern)) {
		const matchStart = match.index!;
		if (matchStart > lastIndex) {
			segments.push({ text: result.slice(lastIndex, matchStart), isCode: false });
		}
		segments.push({ text: match[0], isCode: true });
		lastIndex = matchStart + match[0].length;
	}
	if (lastIndex < result.length) {
		segments.push({ text: result.slice(lastIndex), isCode: false });
	}

	// Phase 3: Apply remaining transforms to non-code segments, strip markers from code
	const transformed = segments
		.map((seg) => {
			if (seg.isCode) {
				return stripCodeMarkers(seg.text);
			}
			return transformProse(seg.text);
		})
		.join('');

	return transformed;
}

/** Strip `// [!code highlight]` and similar shiki markers from code blocks. */
function stripCodeMarkers(code: string): string {
	return code.replace(/ *\/\/ \[!code[^\]]*\]/g, '');
}

/** Apply all MDX-to-markdown transformations to a non-code-block segment. */
function transformProse(text: string): string {
	let result = text;

	// 1. Strip import statements (single-line, multi-line, and side-effect)
	result = result.replace(/^import\s+[\s\S]*?from\s+['"].*?['"];?\s*$/gm, '');
	result = result.replace(/^import\s+['"].*?['"];?\s*$/gm, '');

	// 2. Strip JSX comments: {/* ... */}
	result = result.replace(/\{\/\*[\s\S]*?\*\/\}\s*\n?/g, '');

	// 3. Strip <Tabs items={[...]}> wrapper (opening and closing)
	result = result.replace(/<Tabs\s+[^>]*>\s*\n?/g, '');
	result = result.replace(/<\/Tabs>\s*\n?/g, '');

	// 4. Transform <Tab value="Label">...</Tab> to ### Label headings
	result = result.replace(/<Tab\s+value="([^"]*)">\s*\n?/g, '### $1\n\n');
	result = result.replace(/<\/Tab>\s*\n?/g, '');

	// 5. Transform <Callout> to GitHub admonition style blockquotes
	result = transformCallouts(result);

	// 6. Strip <Cards> wrapper
	result = result.replace(/<Cards>\s*\n?/g, '');
	result = result.replace(/<\/Cards>\s*\n?/g, '');

	// 7. Transform <CardLink> to markdown list items
	result = transformCardLinks(result);

	// 8. Transform <ExternalCard> to markdown list items (same structure as CardLink)
	result = transformExternalCards(result);

	// 9. Strip <Steps> wrapper and <Step> children
	result = result.replace(/<Steps>\s*\n?/g, '');
	result = result.replace(/<\/Steps>\s*\n?/g, '');
	result = result.replace(/<Step>\s*\n?/g, '');
	result = result.replace(/<\/Step>\s*\n?/g, '');

	// 10. Transform <ParamTable> to markdown tables
	result = transformParamTable(result);

	// 11. Transform <ResponseFields> to markdown tables
	result = transformResponseFields(result);

	// 12. Transform <ApiEndpoint> to method + path display
	result = transformApiEndpoint(result);

	// 13. Transform <ApiExample> to curl code blocks
	result = transformApiExample(result);

	// 14. Strip <CopyMigrationPrompt ... /> entirely
	result = result.replace(/<CopyMigrationPrompt\s*[^/]*\/>\s*\n?/g, '');

	// 15. Strip remaining self-closing JSX tags (ThemeImage, GravityNetworkDiagram, RegionPicker, etc.)
	// Use a regex that handles > inside quoted attribute values
	result = stripSelfClosingJSX(result);

	// Clean up excessive blank lines (more than 2 consecutive)
	result = result.replace(/\n{4,}/g, '\n\n\n');

	return result;
}

/**
 * Strip self-closing JSX tags like <RegionPicker />, <ThemeImage ... />, etc.
 * Handles > characters inside quoted attribute values (e.g., body="<binary data>").
 */
function stripSelfClosingJSX(text: string): string {
	let result = text;
	// Match uppercase-starting tags (JSX components) that are self-closing.
	// We scan character-by-character to correctly handle > inside quotes.
	const tagPattern = /<[A-Z]/;
	let safetyCounter = 0;

	while (safetyCounter < 500) {
		safetyCounter++;
		const match = result.match(tagPattern);
		if (!match) break;

		const start = match.index!;
		let i = start + 2; // past "<X"
		let inString: '"' | "'" | null = null;
		let braceDepth = 0;
		let foundEnd = false;
		let isSelfClosing = false;

		while (i < result.length) {
			const ch = result[i];

			if (inString) {
				if (ch === inString) inString = null;
				i++;
				continue;
			}

			if (ch === '"' || ch === "'") {
				inString = ch;
				i++;
				continue;
			}

			if (ch === '{') {
				braceDepth++;
				i++;
				continue;
			}
			if (ch === '}') {
				braceDepth--;
				i++;
				continue;
			}

			if (braceDepth === 0) {
				if (ch === '/' && i + 1 < result.length && result[i + 1] === '>') {
					// Self-closing: />
					isSelfClosing = true;
					foundEnd = true;
					i += 2; // past />
					break;
				}
				if (ch === '>') {
					// Opening tag, not self-closing. Stop so we don't eat content.
					foundEnd = true;
					isSelfClosing = false;
					break;
				}
			}

			i++;
		}

		if (!foundEnd || !isSelfClosing) {
			// Not a self-closing tag or malformed. Replace the < with a sentinel
			// to avoid infinite loop, then restore later.
			result = result.slice(0, start) + '\x00' + result.slice(start + 1);
			continue;
		}

		// Consume trailing whitespace/newline
		if (i < result.length && result[i] === '\n') i++;

		result = result.slice(0, start) + result.slice(i);
	}

	// Restore any sentinel characters
	result = result.replace(/\x00/g, '<');
	return result;
}

/**
 * Transform <ExternalCard> components into markdown list items.
 * Same multi-line self-closing structure as CardLink but with a different tag name.
 */
function transformExternalCards(text: string): string {
	let result = text;
	const openPattern = /<ExternalCard\s/;
	let safetyCounter = 0;

	while (safetyCounter < 200) {
		safetyCounter++;
		const openMatch = result.match(openPattern);
		if (!openMatch) break;

		let start = openMatch.index!;
		while (start > 0 && (result[start - 1] === ' ' || result[start - 1] === '\t')) {
			start--;
		}

		// Find the true end by scanning for /> outside braces
		let braceDepth = 0;
		let endIdx = -1;
		for (let i = start; i < result.length - 1; i++) {
			if (result[i] === '{') {
				braceDepth++;
			} else if (result[i] === '}') {
				braceDepth--;
			} else if (result[i] === '/' && result[i + 1] === '>' && braceDepth === 0) {
				endIdx = i + 2;
				break;
			}
		}
		if (endIdx === -1) break;

		if (endIdx < result.length && result[endIdx] === '\n') {
			endIdx++;
		}

		const fullTag = result.slice(start, endIdx);

		// Strip icon={...} (may contain nested braces)
		let cleaned = fullTag;
		const iconStart = cleaned.indexOf('icon={');
		if (iconStart !== -1) {
			let depth = 0;
			let iconEnd = iconStart;
			for (let i = iconStart + 5; i < cleaned.length; i++) {
				if (cleaned[i] === '{') depth++;
				else if (cleaned[i] === '}') {
					depth--;
					if (depth === 0) {
						iconEnd = i + 1;
						break;
					}
				}
			}
			cleaned = cleaned.slice(0, iconStart) + cleaned.slice(iconEnd);
		}

		const normalized = cleaned.replace(/\s+/g, ' ');
		const hrefMatch = normalized.match(/href="([^"]*)"/);
		const titleMatch = normalized.match(/title="([^"]*)"/);
		const descMatch = normalized.match(/description="([^"]*)"/);

		const href = hrefMatch?.[1] ?? '';
		const title = titleMatch?.[1] ?? '';
		const desc = descMatch?.[1] ?? '';

		const sep = desc ? ' \u2014 ' : '';
		const replacement = `- [${title}](${href})${sep}${desc}\n`;

		result = result.slice(0, start) + replacement + result.slice(endIdx);
	}

	return result;
}

/**
 * Transform <ParamTable params={[...]}> into a markdown table.
 * The params prop is a JSON array of objects with name, type, in, required, description.
 */
function transformParamTable(text: string): string {
	let result = text;
	const openPattern = /<ParamTable\s+params=\{/;
	let safetyCounter = 0;

	while (safetyCounter < 200) {
		safetyCounter++;
		const match = result.match(openPattern);
		if (!match) break;

		const start = match.index!;
		// Find the JSON array by scanning for balanced braces
		const braceStart = start + match[0].length - 1; // position of opening {
		const jsonAndRest = extractBalancedBraces(result, braceStart);
		if (!jsonAndRest) break;

		const { content: jsonStr, endIdx: braceEnd } = jsonAndRest;

		// Find the closing /> after the brace
		let tagEnd = braceEnd;
		while (tagEnd < result.length && result[tagEnd] !== '/') tagEnd++;
		if (tagEnd < result.length - 1 && result[tagEnd] === '/' && result[tagEnd + 1] === '>') {
			tagEnd += 2;
		}
		// Consume trailing newline
		if (tagEnd < result.length && result[tagEnd] === '\n') tagEnd++;

		// Parse the JSON
		let params: Array<{
			name: string;
			type: string;
			in?: string;
			required: boolean;
			description: string;
		}>;
		try {
			params = JSON.parse(jsonStr);
		} catch (err) {
			console.error('Failed to parse <ParamTable> JSON:', jsonStr.slice(0, 100));
			throw err;
		}

		// Render as markdown table
		const hasIn = params.some((p) => p.in);
		let table: string;
		if (hasIn) {
			table = '| Parameter | Type | In | Required | Description |\n';
			table += '|-----------|------|----|----------|-------------|\n';
			for (const p of params) {
				table += `| \`${p.name}\` | \`${p.type}\` | ${p.in ?? ''} | ${p.required ? 'Yes' : 'No'} | ${p.description} |\n`;
			}
		} else {
			table = '| Parameter | Type | Required | Description |\n';
			table += '|-----------|------|----------|-------------|\n';
			for (const p of params) {
				table += `| \`${p.name}\` | \`${p.type}\` | ${p.required ? 'Yes' : 'No'} | ${p.description} |\n`;
			}
		}

		result = result.slice(0, start) + table + result.slice(tagEnd);
	}

	return result;
}

/**
 * Transform <ResponseFields fields={[...]}> into a markdown table.
 * Same structure as ParamTable but uses "fields" prop and has no "in" column.
 */
function transformResponseFields(text: string): string {
	let result = text;
	const openPattern = /<ResponseFields\s+fields=\{/;
	let safetyCounter = 0;

	while (safetyCounter < 200) {
		safetyCounter++;
		const match = result.match(openPattern);
		if (!match) break;

		const start = match.index!;
		const braceStart = start + match[0].length - 1;
		const jsonAndRest = extractBalancedBraces(result, braceStart);
		if (!jsonAndRest) break;

		const { content: jsonStr, endIdx: braceEnd } = jsonAndRest;

		let tagEnd = braceEnd;
		while (tagEnd < result.length && result[tagEnd] !== '/') tagEnd++;
		if (tagEnd < result.length - 1 && result[tagEnd] === '/' && result[tagEnd + 1] === '>') {
			tagEnd += 2;
		}
		if (tagEnd < result.length && result[tagEnd] === '\n') tagEnd++;

		let fields: Array<{ name: string; type: string; required: boolean; description: string }>;
		try {
			fields = JSON.parse(jsonStr);
		} catch (err) {
			console.error('Failed to parse <ResponseFields> JSON:', jsonStr.slice(0, 100));
			throw err;
		}

		let table = '| Field | Type | Required | Description |\n';
		table += '|-------|------|----------|-------------|\n';
		for (const f of fields) {
			table += `| \`${f.name}\` | \`${f.type}\` | ${f.required ? 'Yes' : 'No'} | ${f.description} |\n`;
		}

		result = result.slice(0, start) + table + result.slice(tagEnd);
	}

	return result;
}

/**
 * Transform <ApiEndpoint method="X" path="Y" /> into a bold method + code path line.
 * Also handles optional description prop.
 */
function transformApiEndpoint(text: string): string {
	let result = text;
	const pattern = /<ApiEndpoint\s/;
	let safetyCounter = 0;

	while (safetyCounter < 200) {
		safetyCounter++;
		const match = result.match(pattern);
		if (!match) break;

		const start = match.index!;
		// Find closing />
		let endIdx = start;
		while (endIdx < result.length - 1) {
			if (result[endIdx] === '/' && result[endIdx + 1] === '>') {
				endIdx += 2;
				break;
			}
			endIdx++;
		}
		if (endIdx < result.length && result[endIdx] === '\n') endIdx++;

		const fullTag = result.slice(start, endIdx);
		const methodMatch = fullTag.match(/method="([^"]*)"/);
		const pathMatch = fullTag.match(/path="([^"]*)"/);

		const method = methodMatch?.[1] ?? '';
		const path = pathMatch?.[1] ?? '';

		const replacement = `**${method}** \`${path}\`\n`;

		result = result.slice(0, start) + replacement + result.slice(endIdx);
	}

	return result;
}

/**
 * Transform <ApiExample> into a curl code block.
 *
 * Handles three forms:
 * - Self-closing with no body: <ApiExample method="GET" path="/foo" />
 * - Self-closing with string body: <ApiExample method="POST" path="/foo" body="<binary>" ... />
 * - Multi-line with JSX object body: <ApiExample method="POST" path="/foo" body={{ ... }} />
 *
 * Uses character scanning to handle > inside quoted attributes and {{ }} JSX objects.
 */

/** Escape single quotes for safe embedding in shell single-quoted strings. */
function escapeShellSingleQuote(s: string): string {
	return s.replace(/'/g, "'\"'\"'");
}

function transformApiExample(text: string): string {
	let result = text;
	const openPattern = /<ApiExample\s/;
	let safetyCounter = 0;

	while (safetyCounter < 500) {
		safetyCounter++;
		const match = result.match(openPattern);
		if (!match) break;

		const start = match.index!;

		// Scan to find the end of this tag, respecting quotes and braces
		let i = start + 1;
		let inString: '"' | "'" | null = null;
		let braceDepth = 0;
		let endIdx = -1;

		while (i < result.length) {
			const ch = result[i];

			if (inString) {
				if (ch === inString) inString = null;
				i++;
				continue;
			}

			if (ch === '"' || ch === "'") {
				inString = ch;
				i++;
				continue;
			}

			if (ch === '{') {
				braceDepth++;
				i++;
				continue;
			}
			if (ch === '}') {
				braceDepth--;
				i++;
				continue;
			}

			if (braceDepth === 0 && ch === '/' && i + 1 < result.length && result[i + 1] === '>') {
				endIdx = i + 2;
				break;
			}

			i++;
		}

		if (endIdx === -1) break;
		if (endIdx < result.length && result[endIdx] === '\n') endIdx++;

		const fullTag = result.slice(start, endIdx);

		// Extract simple string attributes
		const methodMatch = fullTag.match(/method="([^"]*)"/);
		const pathMatch = fullTag.match(/path="([^"]*)"/);
		const hostMatch = fullTag.match(/host="([^"]*)"/);
		const bodyStringMatch = fullTag.match(/body="([^"]*)"/);

		const method = methodMatch?.[1] ?? 'GET';
		const path = pathMatch?.[1] ?? '';
		const host = hostMatch?.[1];

		// Extract JSX object body: body={{ ... }}
		let bodyObj: string | null = null;
		const bodyObjMatch = fullTag.match(/body=\{\{/);
		if (bodyObjMatch && !bodyStringMatch) {
			const bodyStart = fullTag.indexOf('body={{');
			if (bodyStart !== -1) {
				// Find balanced braces starting from the outer {
				const extracted = extractBalancedBraces(fullTag, bodyStart + 5);
				if (extracted) {
					try {
						bodyObj = JSON.stringify(JSON.parse(extracted.content), null, 2);
					} catch {
						bodyObj = extracted.content;
					}
				}
			}
		}

		const baseUrl = host ? `https://${host}.agentuity.cloud` : 'https://api.agentuity.cloud';
		let curl = `\`\`\`bash\ncurl -X ${method} "${baseUrl}${path}"`;
		curl += ' \\\n  -H "Authorization: Bearer $SDK_KEY"';

		if (bodyObj) {
			curl += ' \\\n  -H "Content-Type: application/json"';
			curl += ` \\\n  -d '${escapeShellSingleQuote(bodyObj)}'`;
		} else if (bodyStringMatch) {
			// String body (binary data placeholders)
			const bodyStr = bodyStringMatch[1];
			// Extract headers if present
			const headersMatch = fullTag.match(/headers=\{\{([^}]*)\}\}/);
			if (headersMatch) {
				// Parse simple header object like {"Content-Type":"application/octet-stream"}
				try {
					const headers = JSON.parse(`{${headersMatch[1]}}`);
					for (const [k, v] of Object.entries(headers)) {
						curl += ` \\\n  -H "${k}: ${v}"`;
					}
				} catch {
					// fall through
				}
			}
			curl += ` \\\n  --data-binary '${escapeShellSingleQuote(bodyStr)}'`;
		}

		curl += '\n```\n';

		result = result.slice(0, start) + curl + result.slice(endIdx);
	}

	return result;
}

/**
 * Extract content between balanced braces starting at the given position.
 * The character at `start` must be '{'.
 * Returns the content between the outermost braces and the position after the closing '}'.
 */
function extractBalancedBraces(
	text: string,
	start: number
): { content: string; endIdx: number } | null {
	if (text[start] !== '{') return null;

	let depth = 0;
	for (let i = start; i < text.length; i++) {
		if (text[i] === '{') depth++;
		else if (text[i] === '}') {
			depth--;
			if (depth === 0) {
				return {
					content: text.slice(start + 1, i),
					endIdx: i + 1,
				};
			}
		}
	}
	return null;
}

/**
 * Map Callout type to GitHub admonition keyword.
 * Unrecognized types fall back to NOTE.
 */
function calloutTypeToAdmonition(type: string): string {
	switch (type) {
		case 'info':
			return 'NOTE';
		case 'warning':
			return 'WARNING';
		case 'tip':
			return 'TIP';
		case 'success':
			return 'NOTE';
		case 'error':
			return 'CAUTION';
		default:
			return 'NOTE';
	}
}

/**
 * Transform <Callout type="X" title="Y">content</Callout> into GitHub admonition blockquotes.
 *
 * Handles both titled and untitled callouts, and content that may contain
 * nested markdown including code blocks (which are already extracted before
 * this function runs, but the content itself can be multi-paragraph).
 */
function transformCallouts(text: string): string {
	// Match callouts. The content between opening and closing tags can span many lines.
	// Use a manual approach to handle nested content correctly.
	let result = text;

	// Pattern matches: <Callout type="X" title="Y"> or <Callout type="X">
	const openTagPattern = /<Callout\s+type="([^"]*)"(?:\s+title="([^"]*)")?\s*>/;

	// Process callouts iteratively (a callout could appear anywhere in the text)
	let safetyCounter = 0;
	while (safetyCounter < 200) {
		safetyCounter++;
		const openMatch = result.match(openTagPattern);
		if (!openMatch) break;

		const openTagStart = openMatch.index!;
		const openTagEnd = openTagStart + openMatch[0].length;
		const type = openMatch[1];
		const title = openMatch[2]; // undefined if no title attribute

		// Find the matching </Callout> tag
		const closeTag = '</Callout>';
		const closeIdx = result.indexOf(closeTag, openTagEnd);
		if (closeIdx === -1) break; // malformed, stop processing

		const innerContent = result.slice(openTagEnd, closeIdx).trim();
		const admonition = calloutTypeToAdmonition(type);

		// Build the blockquote
		let blockquote = `> [!${admonition}]`;
		if (title) {
			blockquote += `\n> **${title}**`;
		}
		// Prefix each line of content with "> "
		if (innerContent) {
			const contentLines = innerContent.split('\n');
			const quotedLines = contentLines.map((line) => (line === '' ? '>' : `> ${line}`));
			blockquote += '\n' + quotedLines.join('\n');
		}

		const afterClose = closeIdx + closeTag.length;
		result = result.slice(0, openTagStart) + blockquote + result.slice(afterClose);
	}

	return result;
}

/**
 * Transform <CardLink> components into markdown list items.
 * Handles both single-line self-closing and multi-line self-closing forms.
 *
 * <CardLink href="X" title="Y" description="Z" icon={...} />
 *   becomes: - [Y](X): Z
 *
 * Uses iterative matching because the icon={<Component />} prop contains
 * a nested self-closing JSX tag whose /> would confuse a simple regex.
 */
function transformCardLinks(text: string): string {
	let result = text;
	const openPattern = /<CardLink\s/;
	let safetyCounter = 0;

	while (safetyCounter < 200) {
		safetyCounter++;
		const openMatch = result.match(openPattern);
		if (!openMatch) break;

		// Consume any leading whitespace on the same line before <CardLink
		let start = openMatch.index!;
		while (start > 0 && (result[start - 1] === ' ' || result[start - 1] === '\t')) {
			start--;
		}

		// Find the true end of this self-closing tag by scanning for />
		// that is NOT inside a nested {...} block.
		let braceDepth = 0;
		let endIdx = -1;
		for (let i = start; i < result.length - 1; i++) {
			if (result[i] === '{') {
				braceDepth++;
			} else if (result[i] === '}') {
				braceDepth--;
			} else if (result[i] === '/' && result[i + 1] === '>' && braceDepth === 0) {
				endIdx = i + 2; // past the ">"
				break;
			}
		}
		if (endIdx === -1) break; // malformed, stop

		// Consume trailing newline after the tag
		if (endIdx < result.length && result[endIdx] === '\n') {
			endIdx++;
		}

		const fullTag = result.slice(start, endIdx);

		// Extract attributes from the tag body (strip icon={...} first for cleaner parsing)
		const withoutIcon = fullTag.replace(/icon=\{[^}]*\}/g, '');
		const normalized = withoutIcon.replace(/\s+/g, ' ');

		const hrefMatch = normalized.match(/href="([^"]*)"/);
		const titleMatch = normalized.match(/title="([^"]*)"/);
		const descMatch = normalized.match(/description="([^"]*)"/);

		const href = hrefMatch?.[1] ?? '';
		const title = titleMatch?.[1] ?? '';
		const desc = descMatch?.[1] ?? '';

		const replacement = desc ? `- [${title}](${href}): ${desc}\n` : `- [${title}](${href})\n`;

		result = result.slice(0, start) + replacement + result.slice(endIdx);
	}

	return result;
}

async function processFile(mdxPath: string): Promise<DocPage> {
	const raw = await readFile(mdxPath, 'utf-8');
	const { data, content } = matter(raw);

	const title = data.title || 'Untitled';
	const description = data.description || '';
	const urlPath = mdxPathToUrlPath(mdxPath);
	const mdPath = urlPathToMdOutputPath(urlPath);

	// Transform MDX components to clean markdown before building output
	const cleanedContent = transformMDXtoMarkdown(content);

	// Transform content: prepend title and description
	const markdownContent = `# ${title}

${description}

${cleanedContent.trim()}`;

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

/** Remove stale .md files from previous runs so orphaned content doesn't persist. */
async function cleanGeneratedMarkdown(dir: string) {
	let entries: Awaited<ReturnType<typeof readdir>>;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (err: unknown) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
			return; // Directory doesn't exist yet (fresh environment)
		}
		throw err;
	}
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			// Skip non-generated directories (images, etc.)
			if (entry.name === 'images') continue;
			await cleanGeneratedMarkdown(fullPath);
			// Remove the directory if it's now empty
			const remaining = await readdir(fullPath);
			if (remaining.length === 0) {
				await rm(fullPath, { recursive: true });
			}
		} else if (entry.name.endsWith('.md')) {
			await rm(fullPath);
		}
	}
}

async function main() {
	const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

	// Clean stale .md files from previous runs before generating fresh output
	await cleanGeneratedMarkdown(OUTPUT_DIR);

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

	console.log(`Generated ${pages.length} markdown files + llms.txt + llms-full.txt + sitemap.xml`);
}

function generateLlmsTxt(pages: DocPage[]): string {
	const pagesByUrl = new Map(pages.map((p) => [p.urlPath, p]));
	const emitted = new Set<string>();
	const missing = new Set<string>();
	const lines: string[] = [getLlmsPreamble(), ''];

	const fmt = (p: DocPage) => {
		const link = `- [${p.title}](${BASE_URL}${p.urlPath}.md)`;
		return p.description ? `${link}: ${p.description}` : link;
	};

	const emitUrl = (url: string | undefined) => {
		if (!url || emitted.has(url)) return;
		const page = pagesByUrl.get(url);
		if (!page) {
			missing.add(url);
			return;
		}
		emitted.add(url);
		lines.push(fmt(page));
	};

	const walk = (items: NavItem[], level: number) => {
		// Partition into flat items (no children) and grouped items (with children).
		// Emit all flats first as direct bullets under the current parent heading,
		// then emit groups with their own sub-headings. This keeps flat siblings
		// from being visually orphaned between sub-sections when nav-data mixes
		// both kinds at the same level.
		const flats = items.filter((item) => !item.items || item.items.length === 0);
		const groups = items.filter((item) => item.items && item.items.length > 0);

		for (const item of flats) {
			emitUrl(item.url);
		}

		for (const item of groups) {
			// Ensure a blank line separates the previous content from a sub-heading.
			if (lines.length > 0 && lines[lines.length - 1] !== '') {
				lines.push('');
			}
			const children = item.items ?? [];
			lines.push(`${'#'.repeat(level)} ${item.title}`, '');
			emitUrl(item.url);
			walk(children, level + 1);
		}
	};

	for (const section of navData) {
		if (section.hideItems) continue;
		lines.push(`## ${section.title}`, '');
		emitUrl(section.url);
		walk(section.items, 3);
		lines.push('');
	}

	if (missing.size > 0) {
		console.error(
			`[generateLlmsTxt] Missing pages for nav URLs: ${Array.from(missing).join(', ')}`
		);
	}

	const orphanPages = pages.filter((page) => !emitted.has(page.urlPath));
	if (orphanPages.length > 0) {
		console.error(
			`[generateLlmsTxt] Found orphan pages not present in nav-data.ts: ${orphanPages
				.map((page) => page.urlPath)
				.join(', ')}`
		);
		lines.push('## Other', '');
		for (const page of orphanPages) {
			lines.push(fmt(page));
		}
		lines.push('');
	}

	return lines.join('\n').trimEnd() + '\n';
}

function generateLlmsFullTxt(pages: DocPage[]): string {
	const preamble = `${getLlmsPreamble()}

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

function getLlmsPreamble(): string {
	return `# Agentuity Documentation

> The full-stack platform for AI agents.

Agentuity is a cloud platform for building, deploying, and operating AI agents.
The TypeScript SDK provides a Bun-native runtime, schema validation, and React
hooks. Use the \`agentuity\` CLI for local development and deployment.

## Built-in services

Services include, but are not limited to:

- **Routes and APIs**: type-safe Hono routes with auth, rate limiting, SSE, and WebSockets
- **Frontend**: end-to-end type safety from agent schemas to React hooks
- **Data and storage**: Postgres, key-value, vector, object storage, and durable streams
- **Sandboxes**: isolated runtimes for untrusted or generated code
- **Messaging and scheduling**: queues, webhooks, email, and cron-style schedules
- **Authentication**: sessions, API keys, bearer tokens, and OAuth apps
- **AI Gateway**: LLM provider routing with usage and cost visibility
- **Observability**: OpenTelemetry traces, structured logs, and session analytics
- **Evals**: evaluation runs attached to real sessions and traces
- **Agent-to-agent communication**: type-safe calls between agents with context propagation
- **Workbench**: interactive testing for local and deployed agents

## Notes

- This covers the Agentuity platform. General AI agent concepts may require
  outside sources.
- Bun is the supported runtime, so examples assume TypeScript and Bun.
- LLM requests route through the Agentuity AI Gateway by default, so no
  separate provider API keys are required.`;
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
