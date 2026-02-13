import * as React from 'react';
import { ChevronRight, SearchIcon, SparklesIcon } from 'lucide-react';
import {
	Collapsible,
	CollapsibleContent,
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
import { cn } from '../../lib/utils';
import { navData, hasActiveChild, type NavItem, type NavSection } from './nav-data';

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	currentPage: string;
	onNavigate: (page: string) => void;
	onOpenSearch: () => void;
	onOpenAISearch: () => void;
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

// Recursive nav item component - handles any depth
function RecursiveNavItem({
	item,
	depth,
	currentUrl,
	onNavigate,
}: {
	item: NavItem;
	depth: number;
	currentUrl: string;
	onNavigate: (page: string) => void;
}) {
	const hasChildren = item.items && item.items.length > 0;
	const isActive = item.url === currentUrl;
	const hasActiveDescendant = hasChildren && hasActiveChild(item.items!, currentUrl);
	const [open, setOpen] = React.useState(hasActiveDescendant || (isActive && !!hasChildren));

	// Auto-expand when this item or a descendant becomes active
	React.useEffect(() => {
		if (hasActiveDescendant || (isActive && hasChildren)) {
			setOpen(true);
		}
	}, [hasActiveDescendant, isActive, hasChildren]);

	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		if (hasChildren) {
			if (item.url) {
				// Always navigate to the item's URL
				onNavigate(item.url === '/' ? 'home' : item.url.slice(1));
				// Ensure children are expanded when navigating
				setOpen(true);
			} else {
				// No URL — just toggle (e.g. grouping header with no page)
				setOpen((prev) => !prev);
			}
		} else if (item.url) {
			// Leaf node - just navigate
			onNavigate(item.url === '/' ? 'home' : item.url.slice(1));
		}
	};

	const handleChevronClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setOpen((prev) => !prev);
	};

	// Leaf node (no children) - render as link
	if (!hasChildren) {
		if (depth === 0) {
			// Top-level leaf
			return (
				<SidebarMenuItem>
					<SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
						<a href={item.url || '#'} onClick={handleClick}>
							<span>{item.title}</span>
						</a>
					</SidebarMenuButton>
				</SidebarMenuItem>
			);
		}
		// Nested leaf
		return (
			<SidebarMenuSubItem>
				<SidebarMenuSubButton asChild isActive={isActive}>
					<a href={item.url || '#'} onClick={handleClick}>
						<span>{item.title}</span>
					</a>
				</SidebarMenuSubButton>
			</SidebarMenuSubItem>
		);
	}

	// Node with children - render as collapsible
	if (depth === 0) {
		// Top-level collapsible section
		return (
			<Collapsible asChild open={open} className="group/collapsible">
				<SidebarMenuItem>
					<SidebarMenuButton tooltip={item.title} isActive={isActive} onClick={handleClick}>
						<span>{item.title}</span>
						<ChevronRight
							onClick={handleChevronClick}
							className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
						/>
					</SidebarMenuButton>
					<CollapsibleContent>
						<SidebarMenuSub>
							{item.items!.map((child) => (
								<RecursiveNavItem
									key={child.title}
									item={child}
									depth={depth + 1}
									currentUrl={currentUrl}
									onNavigate={onNavigate}
								/>
							))}
						</SidebarMenuSub>
					</CollapsibleContent>
				</SidebarMenuItem>
			</Collapsible>
		);
	}

	// Nested collapsible (depth >= 1)
	// Use a unique group name based on depth to avoid conflicts
	const groupName = `collapsible-d${depth}-${item.title.replace(/\s+/g, '-').toLowerCase()}`;

	return (
		<Collapsible asChild open={open} className={`group/${groupName}`}>
			<SidebarMenuSubItem>
				<SidebarMenuSubButton
					asChild
					isActive={isActive}
					className={cn(hasActiveDescendant && 'text-sidebar-accent-foreground')}
				>
					<a href={item.url || '#'} onClick={handleClick}>
						<span>{item.title}</span>
						<ChevronRight
							onClick={handleChevronClick}
							className={cn(
								'ml-auto size-4 transition-transform duration-200',
								open && 'rotate-90'
							)}
						/>
					</a>
				</SidebarMenuSubButton>
				<CollapsibleContent>
					<SidebarMenuSub>
						{item.items!.map((child) => (
							<RecursiveNavItem
								key={child.title}
								item={child}
								depth={depth + 1}
								currentUrl={currentUrl}
								onNavigate={onNavigate}
							/>
						))}
					</SidebarMenuSub>
				</CollapsibleContent>
			</SidebarMenuSubItem>
		</Collapsible>
	);
}

// Navigation menu with recursive sections
function NavMain({
	sections,
	currentUrl,
	onNavigate,
}: {
	sections: NavSection[];
	currentUrl: string;
	onNavigate: (page: string) => void;
}) {
	return (
		<SidebarGroup>
			<SidebarMenu>
				{sections.map((section) => {
					const hasChildren = section.items.length > 0 && !section.hideItems;
					const isActive = section.url === currentUrl;
					const hasActiveDescendant = hasActiveChild(section.items, currentUrl);

					// Convert section to NavItem format for recursive rendering
					const sectionAsItem: NavItem = {
						title: section.title,
						url: section.url,
						items: section.hideItems ? undefined : section.items,
					};

					// Direct link for sections with hideItems or no visible sub-items
					if (!hasChildren) {
						return (
							<SidebarMenuItem key={section.title}>
								<SidebarMenuButton
									asChild
									isActive={isActive || hasActiveDescendant}
									tooltip={section.title}
								>
									<a
										href={section.url || '#'}
										onClick={(e) => {
											e.preventDefault();
											onNavigate(
												section.url === '/' ? 'home' : (section.url || '').slice(1)
											);
										}}
									>
										<span>{section.title}</span>
									</a>
								</SidebarMenuButton>
							</SidebarMenuItem>
						);
					}

					// Collapsible section with recursive children
					return (
						<RecursiveNavItem
							key={section.title}
							item={sectionAsItem}
							depth={0}
							currentUrl={currentUrl}
							onNavigate={onNavigate}
						/>
					);
				})}
			</SidebarMenu>
		</SidebarGroup>
	);
}

export function AppSidebar({
	currentPage,
	onNavigate,
	onOpenSearch,
	onOpenAISearch,
	...props
}: AppSidebarProps) {
	const currentUrl = currentPage === 'home' ? '/' : `/${currentPage}`;

	return (
		<Sidebar {...props}>
			<SidebarHeader className="-mb-0.5">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild size="lg">
							<a
								href="/"
								onClick={(e) => {
									e.preventDefault();
									onNavigate('home');
								}}
								aria-label="Go to home"
							>
								<div className="flex aspect-square size-6 items-center justify-center">
									<AgentuityLogo className="size-6" />
								</div>
								<span className="font-normal text-sm">Agentuity</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>

				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={onOpenSearch}
						className="flex flex-1 items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
					>
						<SearchIcon className="size-4" />
						<span className="flex-1 text-left">Search</span>
						<kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-[10px] font-medium text-sidebar-foreground/70">
							<span className="text-xs">⌘</span>K
						</kbd>
					</button>
					<button
						type="button"
						onClick={onOpenAISearch}
						className="flex items-center justify-center size-9 shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
						title="Ask AI"
					>
						<SparklesIcon className="size-4" />
					</button>
				</div>
			</SidebarHeader>

			<SidebarContent>
				<NavMain sections={navData} currentUrl={currentUrl} onNavigate={onNavigate} />
			</SidebarContent>

			<SidebarRail />
		</Sidebar>
	);
}
