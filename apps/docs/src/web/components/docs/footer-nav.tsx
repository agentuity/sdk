import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { findPrevNext } from './nav-data.ts';
import { getFrontmatterForRoute } from './mdx-page.tsx';

export function FooterNav() {
	const location = useLocation();
	const navigate = useNavigate();

	const currentPage = location.pathname === '/' ? 'home' : location.pathname.slice(1);
	const { prev, next } = findPrevNext(currentPage);

	// Don't show footer nav on home page or demo pages
	if (currentPage === 'home' || currentPage === '' || currentPage.startsWith('demo/')) {
		return null;
	}

	// Don't show if no prev or next
	if (!prev && !next) {
		return null;
	}

	// Get descriptions from frontmatter
	const prevDescription = prev ? getFrontmatterForRoute(prev.url)?.description : null;
	const nextDescription = next ? getFrontmatterForRoute(next.url)?.description : null;

	const handleNavigate = (url: string) => {
		const to = url === '/' ? '/' : url;
		void navigate({ to });
	};

	return (
		<footer className="not-prose border-t border-zinc-200 dark:border-zinc-800 mt-12 pt-8 pb-6">
			<nav className="grid grid-cols-2 gap-4">
				{prev ? (
					<a
						href={prev.url}
						onClick={(e) => {
							e.preventDefault();
							handleNavigate(prev.url);
						}}
						className="group flex flex-col items-start gap-1 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-200"
					>
						<span className="flex items-center gap-1 text-sm text-muted-foreground">
							<ChevronLeft className="size-4" />
							<span>Previous</span>
						</span>
						<span className="font-medium text-zinc-900 dark:text-zinc-100">{prev.title}</span>
						{prevDescription && (
							<span className="text-sm text-muted-foreground line-clamp-2">
								{prevDescription}
							</span>
						)}
					</a>
				) : (
					<div />
				)}

				{next ? (
					<a
						href={next.url}
						onClick={(e) => {
							e.preventDefault();
							handleNavigate(next.url);
						}}
						className="group flex flex-col items-end gap-1 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-200 text-right"
					>
						<span className="flex items-center gap-1 text-sm text-muted-foreground">
							<span>Next</span>
							<ChevronRight className="size-4" />
						</span>
						<span className="font-medium text-zinc-900 dark:text-zinc-100">{next.title}</span>
						{nextDescription && (
							<span className="text-sm text-muted-foreground line-clamp-2">
								{nextDescription}
							</span>
						)}
					</a>
				) : (
					<div />
				)}
			</nav>
		</footer>
	);
}
