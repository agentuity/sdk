/**
 * TypeScript module declaration for importing .md files as strings.
 * Bun automatically handles text file imports via its bundler.
 */
declare module '*.md' {
	const content: string;
	export default content;
}
