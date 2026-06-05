import * as React from 'react';
import {
	BookIcon,
	BookOpenIcon,
	BotIcon,
	DatabaseIcon,
	GlobeIcon,
	FileTextIcon,
	LayoutGridIcon,
	MonitorIcon,
	RocketIcon,
	RouteIcon,
	SparklesIcon,
	UsersIcon,
	type LucideIcon,
} from 'lucide-react';
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '../ui';
import { cn } from '../../lib/utils';
import { navData, type NavItem } from './nav-data';
import { searchPagefind } from '../../lib/pagefind-search';
import { SearchKeyboardShortcut } from './keyboard-shortcut';

const MODE_STORAGE_KEY = 'agentuity-search-mode';
const LazyAISearchContent = React.lazy(() =>
	import('./ai-search-content').then((module) => ({ default: module.AISearchContent }))
);

type SearchMode = 'search' | 'ai';

interface SearchDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (page: string) => void;
	initialMode?: SearchMode;
}

interface SearchItem {
	title: string;
	url: string;
	description?: string;
	section: string;
}

type PagefindStatus = 'idle' | 'loading' | 'ready' | 'error';

interface PagefindSearchState {
	readonly query: string;
	readonly items: SearchItem[];
	readonly status: PagefindStatus;
}

function collectItems(items: NavItem[], section: string): SearchItem[] {
	const result: SearchItem[] = [];
	for (const item of items) {
		if (item.url) {
			result.push({ title: item.title, url: item.url, description: item.description, section });
		}
		if (item.items) {
			result.push(...collectItems(item.items, section));
		}
	}
	return result;
}

// Flatten nav data for search
function getAllItems(): SearchItem[] {
	const items: SearchItem[] = [];
	for (const section of navData) {
		items.push(...collectItems(section.items, section.title));
	}
	return items;
}

function getSearchWords(value: string): string[] {
	return value.toLowerCase().split(/\W+/).filter(Boolean);
}

function matchesWordPrefixes(value: string, terms: string[]): boolean {
	const words = getSearchWords(value);
	return terms.every((term) => words.some((word) => word.startsWith(term)));
}

function getNavMatches(query: string, items: SearchItem[]): SearchItem[] {
	const terms = getSearchWords(query);
	if (terms.length === 0) {
		return [];
	}

	const titleMatches: SearchItem[] = [];
	const otherMatches: SearchItem[] = [];
	for (const item of items) {
		if (matchesWordPrefixes(item.title, terms)) {
			titleMatches.push(item);
		} else if (
			matchesWordPrefixes(`${item.title} ${item.description ?? ''} ${item.section}`, terms)
		) {
			otherMatches.push(item);
		}
	}

	return [...titleMatches, ...otherMatches];
}

function mergeSearchItems(primaryItems: SearchItem[], secondaryItems: SearchItem[]): SearchItem[] {
	const seen = new Set<string>();
	const result: SearchItem[] = [];

	for (const item of [...primaryItems, ...secondaryItems]) {
		if (seen.has(item.url)) {
			continue;
		}
		seen.add(item.url);
		result.push(item);
	}

	return result;
}

const sectionIcons: Record<string, LucideIcon> = {
	'SDK Explorer': LayoutGridIcon,
	'Get Started': RocketIcon,
	Agents: BotIcon,
	APIs: GlobeIcon,
	Routes: RouteIcon,
	Frontend: MonitorIcon,
	Services: DatabaseIcon,
	Cookbook: BookOpenIcon,
	Community: UsersIcon,
	Reference: BookIcon,
};

function getInitialMode(): SearchMode {
	try {
		const saved = localStorage.getItem(MODE_STORAGE_KEY);
		if (saved === 'ai' || saved === 'search') return saved;
	} catch {
		// Ignore
	}
	return 'search';
}

export function SearchDialog({ open, onOpenChange, onSelect, initialMode }: SearchDialogProps) {
	const [mode, setMode] = React.useState<SearchMode>(getInitialMode);

	// When dialog opens, use the explicit override or read the persisted preference
	React.useEffect(() => {
		if (open) {
			setMode(initialMode ?? getInitialMode());
		}
	}, [open, initialMode]);

	const handleModeChange = React.useCallback((newMode: SearchMode) => {
		setMode(newMode);
		try {
			localStorage.setItem(MODE_STORAGE_KEY, newMode);
		} catch {
			// Ignore
		}
	}, []);

	// CMD+K cycles between modes when dialog is already open
	React.useEffect(() => {
		if (!open) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				handleModeChange(mode === 'search' ? 'ai' : 'search');
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [open, mode, handleModeChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={cn(
					'overflow-hidden p-0',
					mode === 'ai' && 'flex flex-col h-[75vh] sm:max-w-3xl'
				)}
				showCloseButton={false}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>{mode === 'ai' ? 'Ask AI' : 'Search'}</DialogTitle>
					<DialogDescription>
						{mode === 'ai' ? 'Search documentation with AI' : 'Search for pages and demos'}
					</DialogDescription>
				</DialogHeader>

				{mode === 'search' ? (
					<KeywordSearchContent
						onSelect={onSelect}
						onOpenChange={onOpenChange}
						onSwitchMode={() => handleModeChange('ai')}
					/>
				) : (
					<React.Suspense fallback={null}>
						<LazyAISearchContent
							open={open}
							onOpenChange={onOpenChange}
							onSwitchMode={() => handleModeChange('search')}
						/>
					</React.Suspense>
				)}
			</DialogContent>
		</Dialog>
	);
}

// --- Keyword Search Content ---

function renderTreeItems(
	items: NavItem[],
	onSelect: (url: string) => void,
	sectionIcon: LucideIcon,
	depth: number = 0
): React.ReactNode[] {
	return items.flatMap((item) => {
		const nodes: React.ReactNode[] = [];
		const indent = depth * 16;

		if (item.url) {
			const url = item.url;
			const Icon = depth === 0 ? sectionIcon : FileTextIcon;
			nodes.push(
				<CommandItem
					key={url}
					value={url}
					onSelect={() => onSelect(url)}
					style={{ paddingLeft: `${12 + indent}px` }}
					className="py-1.5"
				>
					<Icon className="mr-2 size-3.5 shrink-0" />
					<span className="text-sm">{item.title}</span>
				</CommandItem>
			);
		} else if (item.items) {
			nodes.push(
				<div
					key={`label-${item.title}`}
					className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground/70"
					style={{ paddingLeft: `${12 + indent}px` }}
				>
					{item.title}
				</div>
			);
		}

		if (item.items) {
			nodes.push(...renderTreeItems(item.items, onSelect, sectionIcon, depth + 1));
		}

		return nodes;
	});
}

function KeywordSearchContent({
	onSelect,
	onOpenChange,
	onSwitchMode,
}: {
	onSelect: (page: string) => void;
	onOpenChange: (open: boolean) => void;
	onSwitchMode: () => void;
}) {
	const [search, setSearch] = React.useState('');
	const [selectedValue, setSelectedValue] = React.useState('');
	const [pagefindState, setPagefindState] = React.useState<PagefindSearchState>({
		query: '',
		items: [],
		status: 'idle',
	});
	const listRef = React.useRef<HTMLDivElement>(null);
	const allItems = React.useMemo(() => getAllItems(), []);

	const handleSelect = (url: string) => {
		onSelect(url.slice(1));
		onOpenChange(false);
	};

	React.useEffect(() => {
		const query = search.trim();
		if (!query) {
			setPagefindState({ query: '', items: [], status: 'idle' });
			return;
		}

		let cancelled = false;
		setPagefindState({ query, items: [], status: 'loading' });

		void searchPagefind(query)
			.then((results) => {
				if (cancelled) {
					return;
				}
				setPagefindState({ query, items: results, status: 'ready' });
			})
			.catch(() => {
				if (cancelled) {
					return;
				}
				setPagefindState({ query, items: [], status: 'error' });
			});

		return () => {
			cancelled = true;
		};
	}, [search]);

	const query = search.trim();
	const pagefindItems = pagefindState.query === query ? pagefindState.items : [];
	const pagefindStatus: PagefindStatus =
		query && pagefindState.query !== query ? 'loading' : pagefindState.status;
	const navMatches = React.useMemo(() => getNavMatches(query, allItems), [query, allItems]);
	const searchItems = React.useMemo(
		() => mergeSearchItems(navMatches, pagefindItems),
		[navMatches, pagefindItems]
	);

	React.useEffect(() => {
		const firstVisibleItem = query ? searchItems[0] : allItems[0];
		setSelectedValue(firstVisibleItem?.url ?? '');
	}, [query, searchItems, allItems]);

	React.useLayoutEffect(() => {
		if (query || pagefindStatus === 'idle') {
			listRef.current?.scrollTo({ top: 0 });
		}
	}, [query, pagefindStatus]);

	const groupedSearchItems = React.useMemo(() => {
		const groups: Record<string, SearchItem[]> = {};
		for (const item of searchItems) {
			if (!groups[item.section]) {
				groups[item.section] = [];
			}
			groups[item.section]!.push(item);
		}
		return groups;
	}, [searchItems]);

	return (
		<Command
			value={selectedValue}
			onValueChange={setSelectedValue}
			shouldFilter={false}
			className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
		>
			<div className="flex items-center [&>[data-slot=command-input-wrapper]]:flex-1 [&>[data-slot=command-input-wrapper]]:border-b-0 border-b">
				<CommandInput placeholder="Search pages..." value={search} onValueChange={setSearch} />
				<button
					type="button"
					onClick={onSwitchMode}
					className="cursor-pointer flex items-center gap-1.5 pl-3 pr-2 py-2 mr-2 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-md transition-colors shrink-0"
					title="Switch to Ask AI"
				>
					<SparklesIcon className="size-3.5" />
					<span>Ask AI</span>
					<SearchKeyboardShortcut />
				</button>
			</div>
			<CommandList ref={listRef} className="h-[400px] max-h-[60vh]">
				{query ? (
					<>
						{pagefindStatus === 'loading' && searchItems.length === 0 && (
							<div className="py-6 text-center text-sm text-muted-foreground">
								Searching...
							</div>
						)}
						{pagefindStatus !== 'loading' && searchItems.length === 0 && (
							<div className="py-6 text-center text-sm text-muted-foreground">
								{pagefindStatus === 'error'
									? 'Search is unavailable right now.'
									: 'No results found.'}
							</div>
						)}
						{Object.entries(groupedSearchItems).map(([section, items]) => {
							const Icon = sectionIcons[section] ?? FileTextIcon;
							return (
								<CommandGroup key={section} heading={section}>
									{items.map((item) => (
										<CommandItem
											key={item.url}
											value={item.url}
											onSelect={() => handleSelect(item.url)}
											className="items-start py-2.5"
										>
											<Icon className="mr-3 size-4 shrink-0 mt-0.5" />
											<div className="flex flex-col gap-0.5 min-w-0 flex-1">
												<span className="text-sm font-medium truncate">
													{item.title}
												</span>
												{item.description && (
													<span className="text-xs text-muted-foreground line-clamp-1">
														{item.description}
													</span>
												)}
											</div>
										</CommandItem>
									))}
								</CommandGroup>
							);
						})}
					</>
				) : (
					navData.map((section) => {
						const Icon = sectionIcons[section.title] ?? FileTextIcon;
						return (
							<CommandGroup key={section.title} heading={section.title}>
								{renderTreeItems(section.items, handleSelect, Icon)}
							</CommandGroup>
						);
					})
				)}
			</CommandList>
		</Command>
	);
}
