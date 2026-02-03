import { MDXProvider } from '@mdx-js/react';
import { Suspense, lazy, useMemo, useState } from 'react';
import { mdxComponents } from './mdx-components';
import { Skeleton } from '../ui/skeleton';
import { useToc, type TocItem } from '../../hooks/use-toc';

interface Frontmatter {
	title?: string;
	description?: string;
}

interface MDXModule {
	default: React.ComponentType;
	frontmatter?: Frontmatter;
	tableOfContents?: TocItem[];
}

// Dynamic import of all MDX files in content directory
const mdxModules = import.meta.glob('../../content/**/*.mdx') as Record<
	string,
	() => Promise<MDXModule>
>;

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

interface MDXPageProps {
	route: string;
}

// Loading skeleton for MDX content
function MDXSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-10 w-3/4" />
			<Skeleton className="h-5 w-full" />
			<div className="h-6" />
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-4 w-2/3" />
			<div className="h-6" />
			<Skeleton className="h-6 w-1/2" />
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-32 w-full" />
		</div>
	);
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
			{title && (
				<h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
					{title}
				</h1>
			)}
			{description && (
				<p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
					{description}
				</p>
			)}
		</header>
	);
}

// Inner component that renders MDX with frontmatter
function MDXRenderer({ modulePath }: { modulePath: string }) {
	const [frontmatter, setFrontmatter] = useState<Frontmatter>({});
	const { setHeadings, setActiveId } = useToc();

	// Create lazy component for the MDX module
	const MDXContent = useMemo(() => {
		const loader = mdxModules[modulePath];
		if (!loader) {
			throw new Error(`MDX module not found: ${modulePath}`);
		}
		return lazy(async () => {
			const mod = await loader();
			// Extract frontmatter when module loads
			setFrontmatter(mod.frontmatter || {});
			// Set ToC from extracted headings
			const toc = mod.tableOfContents || [];
			setHeadings(toc);
			// Set initial active heading
			if (toc[0]) {
				setActiveId(toc[0].id);
			}
			return { default: mod.default };
		});
	}, [modulePath, setHeadings, setActiveId]);

	return (
		<>
			<PageHeader {...frontmatter} />
			<MDXProvider components={mdxComponents}>
				<Suspense fallback={<MDXSkeleton />}>
					<MDXContent />
				</Suspense>
			</MDXProvider>
		</>
	);
}

export function MDXPage({ route }: MDXPageProps) {
	const modulePath = getModulePath(route);

	if (!modulePath) {
		return <NotFound route={route} />;
	}

	return <MDXRenderer modulePath={modulePath} />;
}
