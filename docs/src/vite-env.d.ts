/// <reference types="vite/client" />

declare module '*.mdx' {
	interface MdxTocItem {
		id: string;
		value: string;
		depth: number;
		children?: MdxTocItem[];
	}

	const MDXContent: import('react').ComponentType;
	export default MDXContent;

	export const frontmatter: {
		title?: string;
		short_title?: string;
		description?: string;
		[key: string]: unknown;
	};

	export const tableOfContents: MdxTocItem[];
}
