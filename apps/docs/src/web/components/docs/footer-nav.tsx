import { ChevronLeft, ChevronRight } from 'lucide-react';
import { findPrevNext } from './nav-data';

interface FooterNavProps {
	currentPage: string;
	onNavigate: (page: string) => void;
}

export function FooterNav({ currentPage, onNavigate }: FooterNavProps) {
	const { prev, next } = findPrevNext(currentPage);

	// Don't show footer nav on home page or demo pages (demos have split layout)
	if (currentPage === 'home' || currentPage === '' || currentPage.startsWith('demo/')) {
		return null;
	}

	// Don't show if no prev or next
	if (!prev && !next) {
		return null;
	}

	return (
		<footer className="border-t mt-8 py-6">
			<nav className="flex items-center justify-between gap-4">
				{prev ? (
					<a
						href={prev.url}
						onClick={(e) => {
							e.preventDefault();
							const path = prev.url === '/' ? 'home' : prev.url.slice(1);
							onNavigate(path);
						}}
						className="group flex flex-col items-start gap-1 text-sm hover:text-foreground transition-colors cursor-pointer"
					>
						<span className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground">
							<ChevronLeft className="size-4" />
							<span>Previous</span>
						</span>
						<span className="font-medium text-foreground">{prev.title}</span>
					</a>
				) : (
					<div />
				)}

				{next ? (
					<a
						href={next.url}
						onClick={(e) => {
							e.preventDefault();
							const path = next.url === '/' ? 'home' : next.url.slice(1);
							onNavigate(path);
						}}
						className="group flex flex-col items-end gap-1 text-sm hover:text-foreground transition-colors cursor-pointer"
					>
						<span className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground">
							<span>Next</span>
							<ChevronRight className="size-4" />
						</span>
						<span className="font-medium text-foreground">{next.title}</span>
					</a>
				) : (
					<div />
				)}
			</nav>
		</footer>
	);
}
