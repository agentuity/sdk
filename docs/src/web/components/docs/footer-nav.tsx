import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useLocation } from '@tanstack/react-router';
import { Badge } from '../ui';
import { getFrontmatterForRoute } from './generated/frontmatter-data';
import { findPrevNext, type NavItem } from './nav-data';

function getDescription(item: (NavItem & { url: string }) | undefined): string | null {
	if (!item) return null;
	return item.description ?? getFrontmatterForRoute(item.url)?.description ?? null;
}

export function FooterNav() {
	const location = useLocation();

	const currentPage = location.pathname === '/' ? 'home' : location.pathname.slice(1);
	const { prev, next } = findPrevNext(currentPage);

	// Explorer demo pages use this footer for previous/next demo navigation.
	if (currentPage === 'home' || currentPage === '' || currentPage.startsWith('demo/')) {
		return null;
	}

	// Don't show if no prev or next
	if (!prev && !next) {
		return null;
	}

	const prevDescription = getDescription(prev);
	const nextDescription = getDescription(next);

	return (
		<footer className="not-prose border-t border-zinc-200 dark:border-zinc-800 mt-12 pt-8 pb-6">
			<nav className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
				{prev ? (
					<Link
						to={prev.url}
						className="group flex min-h-28 flex-col items-start gap-2 rounded-lg border border-zinc-200 p-4 transition-colors duration-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
					>
						<Badge variant="outline" className="gap-1 px-2 py-0 text-[11px] font-medium">
							<ChevronLeft className="size-4" />
							<span>Previous</span>
						</Badge>
						<span className="font-medium text-zinc-900 dark:text-zinc-100">{prev.title}</span>
						{prevDescription && (
							<span className="text-sm text-muted-foreground line-clamp-2">
								{prevDescription}
							</span>
						)}
					</Link>
				) : (
					<div />
				)}

				{next ? (
					<Link
						to={next.url}
						className="group flex min-h-28 flex-col items-start gap-2 rounded-lg border border-zinc-200 p-4 text-left transition-colors duration-200 hover:bg-zinc-50 sm:items-end sm:text-right dark:border-zinc-800 dark:hover:bg-zinc-800/50"
					>
						<Badge variant="outline" className="gap-1 px-2 py-0 text-[11px] font-medium">
							<span>Next</span>
							<ChevronRight className="size-4" />
						</Badge>
						<span className="font-medium text-zinc-900 dark:text-zinc-100">{next.title}</span>
						{nextDescription && (
							<span className="text-sm text-muted-foreground line-clamp-2">
								{nextDescription}
							</span>
						)}
					</Link>
				) : (
					<div />
				)}
			</nav>
		</footer>
	);
}
