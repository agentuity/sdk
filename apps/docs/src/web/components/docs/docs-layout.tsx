import * as React from 'react';
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
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
import { HeaderLinks } from './header-links';
import { getFrontmatterForRoute } from './mdx-page';
import { ModeToggle } from './mode-toggle';
import { findBreadcrumbChain } from './nav-data';
import { SearchDialog } from './search-dialog';

function HeaderBreadcrumb({
	currentPage,
	onNavigate,
}: {
	currentPage: string;
	onNavigate: (path: string) => void;
}) {
	const chain =
		currentPage === 'home'
			? [{ title: 'SDK Explorer', url: '/' }]
			: findBreadcrumbChain(currentPage);

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
									<BreadcrumbLink
										href={crumb.url ?? '#'}
										onClick={(e) => {
											e.preventDefault();
											if (crumb.url) {
												const path = crumb.url === '/' ? 'home' : crumb.url.slice(1);
												onNavigate(path);
											}
										}}
									>
										{crumb.title}
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

	// React 19 hoists <title> and <meta> tags to <head>
	const fm = getFrontmatterForRoute(location.pathname);
	const pageTitle = fm?.title
		? `${fm.title} — Agentuity Documentation`
		: 'Agentuity Documentation';
	const pageDescription = fm?.description || 'Agentuity SDK documentation for building AI agents.';

	// Scroll to top on non-hash route changes; hash scrolling is handled by TanStack Router
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

	const openAISearch = React.useCallback(() => {
		setSearchInitialMode('ai');
		setSearchOpen(true);
	}, []);

	const handleSearchOpenChange = React.useCallback((open: boolean) => {
		setSearchOpen(open);
		if (!open) setSearchInitialMode(undefined);
	}, []);

	// Keyboard shortcut for search
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setSearchOpen(true);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	return (
		<SidebarProvider className="min-h-0! h-full">
			<title>{pageTitle}</title>
			<meta property="og:title" content={pageTitle} />
			<meta property="og:description" content={pageDescription} />
			<meta property="og:image" content="https://agentuity.com/og-image.png" />
			<meta property="og:type" content="article" />
			<AppSidebar
				currentPage={currentPage}
				onNavigate={handleNavigate}
				onOpenSearch={() => {
					setSearchInitialMode('search');
					setSearchOpen(true);
				}}
				onOpenAISearch={openAISearch}
			/>
			<SidebarInset className="flex flex-col">
				<header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger />
					<HeaderBreadcrumb currentPage={currentPage} onNavigate={handleNavigate} />
					<div className="flex-1" />
					<HeaderLinks />
					<ModeToggle />
				</header>

				<main ref={mainRef} className="flex-1 overflow-y-auto">
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
