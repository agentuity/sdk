'use client';

import { useEffect } from 'react';
import { useToc, type TocItem } from '../../hooks/use-toc';
import { cn } from '../../lib/utils';

// Flatten nested ToC structure for display
function flattenToc(items: TocItem[], result: TocItem[] = []): TocItem[] {
	for (const item of items) {
		result.push(item);
		if (item.children?.length) {
			flattenToc(item.children, result);
		}
	}
	return result;
}

export function TableOfContents() {
	const { headings, activeId, setActiveId, scrollToHeading } = useToc();

	// Track active heading on scroll
	useEffect(() => {
		const flatHeadings = flattenToc(headings);
		if (flatHeadings.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const visibleEntries = entries.filter((entry) => entry.isIntersecting);
				if (visibleEntries.length > 0) {
					const sorted = visibleEntries.sort((a, b) => {
						const aRect = a.target.getBoundingClientRect();
						const bRect = b.target.getBoundingClientRect();
						return aRect.top - bRect.top;
					});
					const topEntry = sorted[0];
					if (topEntry) {
						setActiveId(topEntry.target.id);
					}
				}
			},
			{
				rootMargin: '-80px 0px -80% 0px',
				threshold: 0,
			}
		);

		flatHeadings.forEach(({ id }) => {
			const element = document.getElementById(id);
			if (element) {
				observer.observe(element);
			}
		});

		return () => observer.disconnect();
	}, [headings, setActiveId]);

	const flatHeadings = flattenToc(headings);

	if (flatHeadings.length === 0) {
		return null;
	}

	return (
		<nav className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
			<p className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">On this page</p>
			<ul className="space-y-2 text-sm pb-4">
				{flatHeadings.map(({ id, value, depth }) => (
					<li key={id}>
						<a
							href={`#${id}`}
							onClick={(e) => {
								e.preventDefault();
								scrollToHeading(id);
								window.history.pushState(null, '', `#${id}`);
							}}
							className={cn(
								'block transition-colors hover:text-cyan-500',
								depth === 3 && 'pl-3',
								activeId === id
									? 'text-cyan-600 dark:text-cyan-400 font-medium'
									: 'text-zinc-600 dark:text-zinc-400'
							)}
						>
							{value}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
