import * as React from 'react';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from '../ui';
import { AppSidebar } from './app-sidebar';
import { getFrontmatterForRoute } from './generated/frontmatter-data';
import { HeaderLinks } from './header-links';
import { ModeToggle } from './mode-toggle';
import { findBreadcrumbChain } from './nav-data';
import { SearchDialog } from './search-dialog';

function HeaderBreadcrumb({ currentPage }: { currentPage: string }) {
	const chain =
		currentPage === 'home' ? [{ title: 'Home', url: '/' }] : findBreadcrumbChain(currentPage);

	if (chain.length === 0) return null;

	return (
		<Breadcrumb className="ml-1">
			<BreadcrumbList>
				{chain.map((crumb, index) => {
					const isLast = index === chain.length - 1;
					return (
						<React.Fragment key={crumb.url ?? crumb.title}>
							{index > 0 && <BreadcrumbSeparator />}
							<BreadcrumbItem>
								{isLast ? (
									<BreadcrumbPage>{crumb.title}</BreadcrumbPage>
								) : (
									<BreadcrumbLink asChild>
										<Link to={crumb.url ?? '#'}>{crumb.title}</Link>
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
						</React.Fragment>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}

export function DocsLayout() {
	const [searchOpen, setSearchOpen] = React.useState(false);
	const [searchInitialMode, setSearchInitialMode] = React.useState<'search' | 'ai'>();
	const location = useLocation();
	const navigate = useNavigate();
	const mainRef = React.useRef<HTMLElement>(null);

	// Convert pathname to currentPage format for backward compatibility
	const currentPage = location.pathname === '/' ? 'home' : location.pathname.slice(1);

	const fm = getFrontmatterForRoute(location.pathname);
	const pageTitle = fm?.title
		? `${fm.title} — Agentuity Documentation`
		: 'Agentuity Documentation';

	// Scroll to top on non-hash route changes; hash scrolling is handled by TanStack Router
	// biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is used as a trigger to scroll to top on route change
	React.useLayoutEffect(() => {
		if (!location.hash) {
			mainRef.current?.scrollTo(0, 0);
		}
	}, [location.pathname, location.hash]);

	const handleNavigate = React.useCallback(
		(path: string) => {
			if (path === 'home') {
				void navigate({ to: '/' });
				return;
			}
			const hashIndex = path.indexOf('#');
			if (hashIndex >= 0) {
				const to = `/${path.slice(0, hashIndex)}`;
				const hash = path.slice(hashIndex + 1);
				void navigate({ to, hash, resetScroll: false });
			} else {
				void navigate({ to: `/${path}` });
			}
		},
		[navigate]
	);

	const openSearch = React.useCallback((mode: 'search' | 'ai') => {
		setSearchInitialMode(mode);
		setSearchOpen(true);
	}, []);

	const openAISearch = React.useCallback(() => openSearch('ai'), [openSearch]);

	const handleSearchOpenChange = React.useCallback((open: boolean) => {
		setSearchOpen(open);
		if (!open) setSearchInitialMode(undefined);
	}, []);

	// Keyboard shortcut for search
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
				if (searchOpen) {
					return;
				}

				e.preventDefault();
				openSearch('search');
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [searchOpen, openSearch]);

	return (
		<SidebarProvider className="min-h-0! h-full">
			<title>{pageTitle}</title>
			<AppSidebar
				currentPage={currentPage}
				onOpenSearch={() => openSearch('search')}
				onOpenAISearch={openAISearch}
			/>
			<SidebarInset className="flex flex-col">
				<header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger />
					<HeaderBreadcrumb currentPage={currentPage} />
					<div className="flex-1" />
					<HeaderLinks />
					<ModeToggle />
				</header>

				<main id="docs-main-scroll" ref={mainRef} className="flex-1 overflow-y-auto">
					<Outlet />
				</main>
			</SidebarInset>

			<SearchDialog
				open={searchOpen}
				onOpenChange={handleSearchOpenChange}
				onSelect={handleNavigate}
				initialMode={searchInitialMode}
			/>
		</SidebarProvider>
	);
}
