import { createFileRoute, Outlet } from '@tanstack/react-router';
import { TableOfContents } from '../../components/docs';
import { TocProvider } from '../../hooks/use-toc';

export const Route = createFileRoute('/_docs')({
	component: DocsContentLayout,
});

function DocsContentLayout() {
	return (
		<TocProvider>
			<div className="flex gap-8 max-w-6xl mx-auto px-6 py-8">
				<article className="prose prose-zinc dark:prose-invert max-w-none flex-1 min-w-0">
					<Outlet />
				</article>
				<aside className="hidden lg:block w-56 shrink-0">
					<TableOfContents />
				</aside>
			</div>
		</TocProvider>
	);
}
