import { createFileRoute, Outlet } from '@tanstack/react-router';
import { TableOfContents, FooterNav } from '../../components/docs/index.ts';
import { TocProvider } from '../../hooks/use-toc.tsx';

export const Route = createFileRoute('/_docs')({
	component: DocsContentLayout,
});

function DocsContentLayout() {
	return (
		<TocProvider>
			<div className="flex gap-8 max-w-6xl mx-auto px-6 py-8">
				<div className="flex-1 min-w-0">
					<Outlet />
					<FooterNav />
				</div>
				<aside className="hidden lg:block w-56 shrink-0">
					<TableOfContents />
				</aside>
			</div>
		</TocProvider>
	);
}
