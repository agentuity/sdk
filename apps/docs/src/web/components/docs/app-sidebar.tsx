import * as React from 'react';
import { ChevronRight, SearchIcon } from 'lucide-react';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarRail,
} from '../ui';
import { navData, hasActiveChild, type NavItem, type NavSection } from './nav-data';

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	currentPage: string;
	onNavigate: (page: string) => void;
	onOpenSearch: () => void;
}

// Agentuity Logo
function AgentuityLogo({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			height="191"
			viewBox="0 0 220 191"
			width="220"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				clipRule="evenodd"
				d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
				fill="#00FFFF"
				fillRule="evenodd"
			/>
			<path
				clipRule="evenodd"
				d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
				fill="#00FFFF"
				fillRule="evenodd"
			/>
		</svg>
	);
}

// Navigation menu with collapsible sections
function NavMain({
	items,
	currentUrl,
	onNavigate,
}: {
	items: {
		title: string;
		url: string;
		isActive?: boolean;
		hideItems?: boolean;
		items?: {
			title: string;
			url: string;
		}[];
	}[];
	currentUrl: string;
	onNavigate: (page: string) => void;
}) {
	return (
		<SidebarGroup>
			<SidebarMenu>
				{items.map((item) =>
					item.hideItems || !item.items?.length ? (
						// Direct link for sections with hideItems or no sub-items
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								asChild
								isActive={item.url === currentUrl || item.isActive}
								tooltip={item.title}
							>
								<a
									href={item.url}
									onClick={(e) => {
										e.preventDefault();
										onNavigate(item.url === '/' ? 'home' : item.url.slice(1));
									}}
								>
									<span>{item.title}</span>
								</a>
							</SidebarMenuButton>
						</SidebarMenuItem>
					) : (
						// Collapsible section for items with sub-items
						<Collapsible
							key={item.title}
							asChild
							defaultOpen={item.isActive}
							className="group/collapsible"
						>
							<SidebarMenuItem>
								<CollapsibleTrigger asChild>
									<SidebarMenuButton tooltip={item.title}>
										<span>{item.title}</span>
										<ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
									</SidebarMenuButton>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<SidebarMenuSub>
										{item.items?.map((subItem) => (
											<SidebarMenuSubItem key={subItem.title}>
												<SidebarMenuSubButton
													asChild
													isActive={subItem.url === currentUrl}
												>
													<a
														href={subItem.url}
														onClick={(e) => {
															e.preventDefault();
															onNavigate(subItem.url.slice(1));
														}}
													>
														<span>{subItem.title}</span>
													</a>
												</SidebarMenuSubButton>
											</SidebarMenuSubItem>
										))}
									</SidebarMenuSub>
								</CollapsibleContent>
							</SidebarMenuItem>
						</Collapsible>
					)
				)}
			</SidebarMenu>
		</SidebarGroup>
	);
}

// Transform nav sections to menu format
function transformToNavItems(sections: NavSection[], currentUrl: string) {
	return sections.map((section) => ({
		title: section.title,
		url: section.url || '#',
		isActive: hasActiveChild(section.items, currentUrl),
		hideItems: section.hideItems,
		items: section.hideItems
			? [] // Don't include sub-items for sections with hideItems
			: section.items
					.filter((item) => item.url) // Only items with URLs
					.map((item) => ({
						title: item.title,
						url: item.url!,
					})),
	}));
}

export function AppSidebar({ currentPage, onNavigate, onOpenSearch, ...props }: AppSidebarProps) {
	const currentUrl = currentPage === 'home' ? '/' : `/${currentPage}`;
	const navItems = transformToNavItems(navData, currentUrl);

	return (
		<Sidebar {...props}>
			<SidebarHeader>
				<a
					href="/"
					onClick={(e) => {
						e.preventDefault();
						onNavigate('home');
					}}
					aria-label="Go to home"
					className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-sidebar-accent transition-colors"
				>
					<AgentuityLogo className="size-6" />
					<span className="font-medium text-sm">Agentuity</span>
				</a>

				<button
					type="button"
					onClick={onOpenSearch}
					className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
				>
					<SearchIcon className="size-4" />
					<span className="flex-1 text-left">Search...</span>
					<kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-[10px] font-medium text-sidebar-foreground/70">
						<span className="text-xs">⌘</span>K
					</kbd>
				</button>
			</SidebarHeader>

			<SidebarContent>
				<NavMain items={navItems} currentUrl={currentUrl} onNavigate={onNavigate} />
			</SidebarContent>

			<SidebarRail />
		</Sidebar>
	);
}
