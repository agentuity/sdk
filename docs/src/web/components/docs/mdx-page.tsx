import { MDXProvider } from '@mdx-js/react';
import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { mdxComponents } from './mdx-components';
import { useToc, type TocItem } from '../../hooks/use-toc';
import { CopyPageDropdown } from './copy-page-dropdown';

export interface Frontmatter {
	title?: string;
	description?: string;
}

export interface MDXModule {
	default: ComponentType;
	frontmatter?: Frontmatter;
	tableOfContents?: TocItem[];
}

interface MDXPageProps {
	module: MDXModule;
}

// Page header with title and description from frontmatter
function PageHeader({ title, description }: Frontmatter) {
	if (!title && !description) return null;

	return (
		<header className="mb-8">
			<div className="flex items-start justify-between gap-4">
				{title && (
					<h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
						{title}
					</h1>
				)}
				<CopyPageDropdown enhanced />
			</div>
			{description && (
				<p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
					{description}
				</p>
			)}
		</header>
	);
}

// Inner component that renders MDX with frontmatter
function MDXRenderer({ module: mod }: { module: MDXModule }) {
	const { setHeadings, setActiveId } = useToc();

	useEffect(() => {
		const toc = mod.tableOfContents || [];
		setHeadings(toc);
		setActiveId(toc[0]?.id || '');
	}, [mod, setHeadings, setActiveId]);

	const Content = mod.default;
	const frontmatter = mod.frontmatter || {};

	return (
		<>
			<PageHeader {...frontmatter} />
			<article className="prose prose-zinc dark:prose-invert max-w-none">
				<MDXProvider components={mdxComponents}>
					<Content />
				</MDXProvider>
			</article>
		</>
	);
}

export function MDXPage({ module }: MDXPageProps) {
	return <MDXRenderer module={module} />;
}
