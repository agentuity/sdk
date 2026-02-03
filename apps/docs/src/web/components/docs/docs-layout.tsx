import * as React from 'react';
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	Separator,
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from '../ui';
import { AppSidebar } from './app-sidebar';
import { FooterNav } from './footer-nav';
import { HeaderLinks } from './header-links';
import { ModeToggle } from './mode-toggle';
import { SearchDialog } from './search-dialog';
import { findCurrentNav } from './nav-data';

export function DocsLayout() {
	const [searchOpen, setSearchOpen] = React.useState(false);
	const location = useLocation();
	const navigate = useNavigate();

	// Convert pathname to currentPage format for backward compatibility
	const currentPage = location.pathname === '/' ? 'home' : location.pathname.slice(1);

	const handleNavigate = React.useCallback(
		(path: string) => {
			const to = path === 'home' ? '/' : `/${path}`;
			void navigate({ to });
		},
		[navigate]
	);

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

	// Get current nav context for breadcrumb
	const { section, item } = findCurrentNav(currentPage);

	// Only show section breadcrumb if we're on a child page (not the section index)
	const showSectionBreadcrumb = section && item;

	return (
		<SidebarProvider className="min-h-0! h-full">
			<AppSidebar
				currentPage={currentPage}
				onNavigate={handleNavigate}
				onOpenSearch={() => setSearchOpen(true)}
			/>
			<SidebarInset className="flex flex-col">
				<header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4" />

					<Breadcrumb className="flex-1">
						<BreadcrumbList>
							{showSectionBreadcrumb && (() => {
								const sectionUrl = section.url;
								return (
									<BreadcrumbItem>
										{sectionUrl ? (
											<BreadcrumbLink
												href={sectionUrl}
												onClick={(e) => {
													e.preventDefault();
													const path = sectionUrl === '/' ? 'home' : sectionUrl.slice(1);
													handleNavigate(path);
												}}
											>
												{section.title}
											</BreadcrumbLink>
										) : (
											<span className="text-muted-foreground">{section.title}</span>
										)}
									</BreadcrumbItem>
								);
							})()}

							{!section && (currentPage === 'home' || currentPage === '') && (
								<BreadcrumbItem>
									<BreadcrumbPage>SDK Explorer</BreadcrumbPage>
								</BreadcrumbItem>
							)}
						</BreadcrumbList>
					</Breadcrumb>

					<HeaderLinks />
					<ModeToggle />
				</header>

				<main className="flex-1 overflow-y-auto">
					<Outlet />
					<div className="max-w-4xl mx-auto px-6">
						<FooterNav currentPage={currentPage} onNavigate={handleNavigate} />
					</div>
				</main>
			</SidebarInset>

			<SearchDialog open={searchOpen} onOpenChange={setSearchOpen} onSelect={handleNavigate} />
		</SidebarProvider>
	);
}
