import { expect, test } from 'bun:test';
import type { Document } from 'langchain/document';
import { detectContentType, hybridChunkDocument } from '../chunk-mdx';

const makeDoc = (content: string): Document => ({
	pageContent: content,
	metadata: { contentType: 'text' },
});

// 1. Headings

test('detects single heading', () => {
	expect(detectContentType('# Heading 1')).toBe('header');
});

test('detects header section', () => {
	expect(
		detectContentType(
			'## Subheading\n Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
		)
	).toBe('header_section');
});

// 2. Paragraphs

test('detects paragraph as text', () => {
	expect(detectContentType('This is a paragraph.')).toBe('text');
});

// 3. Code Blocks

test('detects code block', () => {
	const code = "```js\nconsole.log('hi')\n```";
	expect(detectContentType(code)).toBe('code_block');
});

// 4. Lists

test('detects unordered list', () => {
	const list = '- item 1\n- item 2';
	expect(detectContentType(list)).toBe('list');
});

test('detects ordered list', () => {
	const list = '1. item 1\n2. item 2';
	expect(detectContentType(list)).toBe('list');
});

// 5. Tables

test('detects table', () => {
	const table = '| Col1 | Col2 |\n|------|------|\n| a    | b    |';
	expect(detectContentType(table)).toBe('table');
});

// 6. Frontmatter

test('detects frontmatter', () => {
	const fm = '---\ntitle: Test\n---';
	expect(detectContentType(fm)).toBe('frontmatter');
});

test('detects no frontmatter', () => {
	expect(detectContentType('No frontmatter here')).toBe('text');
});

// 7. Edge Cases

test('empty file returns text', () => {
	expect(detectContentType('')).toBe('text');
});

test('file with only code', () => {
	const code = "```python\nprint('hi')\n```";
	expect(detectContentType(code)).toBe('code_block');
});

test('file with only list', () => {
	const list = '* a\n* b';
	expect(detectContentType(list)).toBe('list');
});

test('file with only table', () => {
	const table = '| A | B |\n|---|---|\n| 1 | 2 |';
	expect(detectContentType(table)).toBe('table');
});

test('file with only frontmatter', () => {
	const fm = '---\ntitle: Only\n---';
	expect(detectContentType(fm)).toBe('frontmatter');
});

// 8. Mixed Content

test('mixed content: heading, paragraph, code, list', async () => {
	const content = [
		'## Title',
		'',
		'This is a paragraph.',
		'',
		'- item 1',
		'- item 2',
		'',
		'```js',
		"console.log('hi')",
		'```',
	].join('\n');
	const doc = makeDoc(content);
	const chunks = await hybridChunkDocument(doc);
	expect(chunks.some((c) => c.metadata.contentType === 'code_block')).toBe(
		true
	);
});

// 10. Nested Lists
test('detects nested lists', () => {
	const list = '- item 1\n  - subitem 1\n  - subitem 2\n- item 2';
	expect(detectContentType(list)).toBe('list');
});

// 11. Lists with Code Blocks
test('list with code block', () => {
	const list = "- item 1\n  ```js\nconsole.log('hi')\n```\n- item 2";
	expect(detectContentType(list)).toBe('code_block');
});

// 12. Tables with Code/Multiline Text
test('table with code in cell', () => {
	const table = '| Col1 | Col2 |\n|------|------|\n| `code` | line 2\nline 3 |';
	expect(detectContentType(table)).toBe('table');
});

test('table with multiline text', () => {
	const table = '| A | B |\n|---|---|\n| line 1\nline 2 | value |';
	expect(detectContentType(table)).toBe('table');
});

// 13. Headers with No Content
test('header with no content', async () => {
	const content = '# Header Only';
	const doc = makeDoc(content);
	const chunks = await hybridChunkDocument(doc);
	expect(chunks.some((c) => c.metadata.contentType === 'header')).toBe(true);
});

// 15. Very Large File
test('very large file splits into multiple chunks', async () => {
	const content = Array(5000).fill('A line of text.').join('\n');
	const doc = makeDoc(content);
	const chunks = await hybridChunkDocument(doc);
	expect(chunks.length).toBeGreaterThan(1);
});

// 16. Short Chunks
test('very short lines are chunked', async () => {
	const content = 'A\nB\nC';
	const doc = makeDoc(content);
	const chunks = await hybridChunkDocument(doc);
	expect(chunks.length).toBeGreaterThan(0);
});

// 17. Inline Code
test('paragraph with inline code', () => {
	const para = 'This is `inline code` in a paragraph.';
	expect(detectContentType(para)).toBe('text');
});

// 18. Blockquotes
test('single-line blockquote', () => {
	const quote = '> This is a quote.';
	expect(detectContentType(quote)).toBe('text'); // No explicit blockquote type
});

test('multi-line blockquote', () => {
	const quote = '> Line 1\n> Line 2';
	expect(detectContentType(quote)).toBe('text'); // No explicit blockquote type
});

// 19. Horizontal Rules
test('horizontal rule is treated as text', () => {
	expect(detectContentType('---')).toBe('text');
	expect(detectContentType('***')).toBe('text');
});

// 21. Leading/Trailing Whitespace
test('leading and trailing whitespace is handled', async () => {
	const content = '   \n\n# Heading\nContent\n\n   ';
	const doc = makeDoc(content);
	const chunks = await hybridChunkDocument(doc);
	expect(chunks.some((c) => c.pageContent.includes('Heading'))).toBe(true);
});
