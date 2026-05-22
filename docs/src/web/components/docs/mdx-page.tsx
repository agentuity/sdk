import { MDXProvider } from '@mdx-js/react';
import { useEffect } from 'react';
import { mdxComponents } from './mdx-components';
import { useToc, type TocItem } from '../../hooks/use-toc';
import { CopyPageDropdown } from './copy-page-dropdown';

interface Frontmatter {
	title?: string;
	description?: string;
}

interface MDXModule {
	default: React.ComponentType;
	frontmatter?: Frontmatter;
	tableOfContents?: TocItem[];
}

// Eager load all MDX files at build time for instant navigation
const mdxModules = import.meta.glob('../../content/**/*.mdx', {
	eager: true,
}) as Record<string, MDXModule>;

// Map route paths to MDX file paths
function getModulePath(route: string): string | null {
	// Try direct path first: "quickstart" -> "../../content/quickstart.mdx"
	const directPath = `../../content/${route}.mdx`;
	if (mdxModules[directPath]) {
		return directPath;
	}

	// Try with index: "services" -> "../../content/services/index.mdx"
	const indexPath = `../../content/${route}/index.mdx`;
	if (mdxModules[indexPath]) {
		return indexPath;
	}

	return null;
}

// Get frontmatter for a route path (used by DocsLayout for title)
export function getFrontmatterForRoute(pathname: string): Frontmatter | null {
	// Convert pathname to route: "/get-started/installation" -> "get-started/installation"
	const route = pathname.startsWith('/') ? pathname.slice(1) : pathname;
	if (!route) return null;

	const modulePath = getModulePath(route);
	if (!modulePath) return null;

	return mdxModules[modulePath]?.frontmatter || null;
}

interface MDXPageProps {
	route: string;
}

// Not found component
function NotFound({ route }: { route: string }) {
	return (
		<div className="text-center py-12">
			<h1 className="text-2xl font-medium mb-4 text-zinc-900 dark:text-zinc-100">
				Page Not Found
			</h1>
			<p className="text-zinc-600 dark:text-zinc-400">
				No content found for{' '}
				<code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">#{route}</code>
			</p>
		</div>
	);
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
function MDXRenderer({ modulePath, route: _route }: { modulePath: string; route: string }) {
	const { setHeadings, setActiveId } = useToc();
	const mod = mdxModules[modulePath];

	useEffect(() => {
		if (!mod) return;
		const toc = mod.tableOfContents || [];
		setHeadings(toc);
		if (toc[0]) {
			setActiveId(toc[0].id);
		}
	}, [mod, setHeadings, setActiveId]);

	if (!mod) return null;

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

export function MDXPage({ route }: MDXPageProps) {
	const modulePath = getModulePath(route);

	if (!modulePath) {
		return <NotFound route={route} />;
	}

	return <MDXRenderer modulePath={modulePath} route={route} />;
}
