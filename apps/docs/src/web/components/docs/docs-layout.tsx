import * as React from 'react';
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../ui';
import { AppSidebar } from './app-sidebar';
import { FooterNav } from './footer-nav';
import { HeaderLinks } from './header-links';
import { ModeToggle } from './mode-toggle';
import { SearchDialog } from './search-dialog';

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
					<div className="flex-1" />
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
