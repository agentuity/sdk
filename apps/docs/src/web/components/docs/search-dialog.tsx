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
	LoaderIcon,
	SearchIcon,
	SendIcon,
	SparklesIcon,
	UsersIcon,
	type LucideIcon,
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
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
	ScrollArea,
	Textarea,
} from '../ui';
import { cn } from '../../lib/utils';
import { DEMOS } from '../../demo-config';
import { navData, type NavItem } from './nav-data';
import { useAISearch } from '../../hooks/use-ai-search';
import { useSearchIndex, type SearchResult } from '../../hooks/use-search-index';
import { AISearchMessages, AISearchActions } from './ai-search-messages';

const MODE_STORAGE_KEY = 'agentuity-search-mode';

type SearchMode = 'search' | 'ai';

interface SearchDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (page: string) => void;
	initialMode?: SearchMode;
}

interface DemoSearchResult {
	id: string;
	title: string;
	pageTitle: string;
	section: 'SDK Explorer';
	url: string;
	snippet: string;
	isPageLevel: true;
	rank: number;
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

function normalizeSearchValue(value: string): string {
	return value.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchDemo(query: string, demo: (typeof DEMOS)[number]): number | null {
	const q = normalizeSearchValue(query);
	if (!q) return null;

	const title = normalizeSearchValue(demo.title);
	const id = normalizeSearchValue(demo.id);
	const subtitle = normalizeSearchValue(demo.subtitle);
	const desc = normalizeSearchValue(demo.description);

	if (title === q || id === q) return 0; // exact title/id
	if (title.startsWith(q) || id.startsWith(q)) return 1; // prefix title/id
	if (title.includes(q) || id.includes(q)) return 2; // substring title/id
	if (subtitle.includes(q)) return 3; // substring subtitle
	if (desc.includes(q)) return 4; // substring description
	return null;
}

export function SearchDialog({ open, onOpenChange, onSelect, initialMode }: SearchDialogProps) {
	const aiSearch = useAISearch();
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
					<AISearchContent
						open={open}
						onOpenChange={onOpenChange}
						onSwitchMode={() => handleModeChange('search')}
						aiSearch={aiSearch}
					/>
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
			const Icon = depth === 0 ? sectionIcon : FileTextIcon;
			nodes.push(
				<CommandItem
					key={item.url}
					value={item.title}
					onSelect={() => onSelect(item.url!)}
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
	const { search: searchIndex, ensureIndex, ready, loading, error } = useSearchIndex();

	// Lazy-init: load search index on first keystroke
	React.useEffect(() => {
		if (search.trim()) {
			ensureIndex();
		}
	}, [search, ensureIndex]);

	const handleSelect = (url: string) => {
		// Strip leading slash for router navigation; handle anchors
		const path = url.startsWith('/') ? url.slice(1) : url;
		onSelect(path);
		onOpenChange(false);
	};

	const demoResults = React.useMemo(() => {
		if (!search.trim()) return [];

		return DEMOS.map((demo) => ({
			id: `demo:${demo.id}`,
			title: demo.title,
			pageTitle: demo.title,
			section: 'SDK Explorer' as const,
			url: `/demo/${demo.id}`,
			snippet: demo.description,
			isPageLevel: true as const,
			rank: matchDemo(search, demo),
		}))
			.filter((entry): entry is DemoSearchResult => entry.rank !== null)
			.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
			.slice(0, 5);
	}, [search]);

	// Group search results by section, cap per page
	const groupedResults: [string, SearchResult[]][] | null = React.useMemo(() => {
		if (!search.trim() || !ready) return null;
		const results = searchIndex(search);
		if (results.length === 0) return null;

		// Cap results per page: keep up to 2 highest-scored entries per base URL
		const pageCounts = new Map<string, number>();
		const deduped: SearchResult[] = [];
		for (const entry of results) {
			const baseUrl = entry.url.split('#')[0] ?? entry.url;
			const count = pageCounts.get(baseUrl) ?? 0;
			if (count < 2) {
				pageCounts.set(baseUrl, count + 1);
				deduped.push(entry);
			}
		}

		// Group by section, preserving MiniSearch ranking order
		const groups: Record<string, SearchResult[]> = {};
		for (const entry of deduped) {
			if (!groups[entry.section]) {
				groups[entry.section] = [];
			}
			groups[entry.section]!.push(entry);
		}

		return Object.entries(groups);
	}, [search, ready, searchIndex]);

	// Reset list scroll to top when results change — must be useLayoutEffect
	// to run before cmdk's internal scrollIntoView scheduling
	React.useLayoutEffect(() => {
		const list = document.querySelector<HTMLElement>('[data-slot="command-list"]');
		if (list) list.scrollTop = 0;
	}, [demoResults, groupedResults]);

	const hasQuery = search.trim().length > 0;
	const hasDemoResults = demoResults.length > 0;
	const noResults = hasQuery && ready && !hasDemoResults && groupedResults === null;

	return (
		<Command
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
					<kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-xs font-medium text-sidebar-foreground/70">
						<span>
							{typeof navigator !== 'undefined' &&
							/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? (
								<span className="text-sm">⌘</span>
							) : (
								'Ctrl '
							)}
						</span>
						K
					</kbd>
				</button>
			</div>
			<CommandList className="max-h-[400px]">
				{hasQuery ? (
					<>
						{loading && !ready && (
							<div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
								<LoaderIcon className="size-4 animate-spin" />
								Searching...
							</div>
						)}
						{error && !ready && !hasDemoResults && (
							<div className="py-8 text-center">
								<p className="text-sm text-muted-foreground">
									Couldn&apos;t load search index
								</p>
								<button
									type="button"
									onClick={onSwitchMode}
									className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-md transition-colors cursor-pointer"
								>
									<SparklesIcon className="size-3.5" />
									Try Ask AI instead
								</button>
							</div>
						)}
						{noResults && (
							<div className="py-8 text-center">
								<p className="text-sm text-muted-foreground">
									No pages match &lsquo;{search.trim()}&rsquo;
								</p>
								<button
									type="button"
									onClick={onSwitchMode}
									className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-md transition-colors cursor-pointer"
								>
									<SparklesIcon className="size-3.5" />
									Ask AI about this
								</button>
							</div>
						)}
						{hasDemoResults && (
							<CommandGroup heading="SDK Explorer">
								{demoResults.map((entry) => (
									<CommandItem
										key={entry.id}
										value={`${entry.title} ${entry.snippet}`}
										onSelect={() => handleSelect(entry.url)}
										className="items-start py-2.5"
									>
										<LayoutGridIcon className="mr-3 size-4 shrink-0 mt-0.5" />
										<div className="flex flex-col gap-0.5 min-w-0 flex-1">
											<span className="text-sm font-medium truncate">
												{entry.title}
											</span>
											{entry.snippet && (
												<span className="text-xs text-muted-foreground line-clamp-1">
													{entry.snippet}
												</span>
											)}
										</div>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{groupedResults &&
							groupedResults.map(([section, entries]) => {
								const Icon = sectionIcons[section] ?? FileTextIcon;
								return (
									<CommandGroup key={section} heading={section}>
										{entries.map((entry) => (
											<CommandItem
												key={entry.id}
												value={entry.id}
												onSelect={() => handleSelect(entry.url)}
												className="items-start py-2.5"
											>
												<Icon className="mr-3 size-4 shrink-0 mt-0.5" />
												<div className="flex flex-col gap-0.5 min-w-0 flex-1">
													<span className="text-sm font-medium truncate">
														{entry.title}
													</span>
													{!entry.isPageLevel && (
														<span className="text-xs text-muted-foreground/70 truncate">
															in {entry.pageTitle}
														</span>
													)}
													{entry.snippet && (
														<span className="text-xs text-muted-foreground line-clamp-1">
															{entry.snippet}
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

// --- AI Search Content ---

function AISearchContent({
	open,
	onOpenChange,
	onSwitchMode,
	aiSearch,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSwitchMode: () => void;
	aiSearch: ReturnType<typeof useAISearch>;
}) {
	const [input, setInput] = React.useState('');
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const navigate = useNavigate();
	const { messages, loading, sendMessage, handleClear, handleRetry } = aiSearch;

	// Focus textarea when dialog opens and after loading completes
	React.useEffect(() => {
		if (open) {
			const timer = setTimeout(() => textareaRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [open]);

	React.useEffect(() => {
		if (!loading) {
			textareaRef.current?.focus();
		}
	}, [loading]);

	const handleSend = () => {
		if (input.trim()) {
			sendMessage(input);
			setInput('');
		}
	};

	const handleSourceClick = React.useCallback(
		(url: string) => {
			if (url && url !== '#' && url.startsWith('/')) {
				onOpenChange(false);
				void navigate({ to: url });
			} else if (url && url.startsWith('http')) {
				window.open(url, '_blank', 'noopener');
			}
		},
		[onOpenChange, navigate]
	);

	return (
		<>
			{/* Header */}
			<div className="flex items-center gap-3 pl-4 pr-2 pt-4 pb-3 border-b">
				<div className="bg-muted rounded-lg p-2 shrink-0">
					<SparklesIcon className="size-4 text-muted-foreground" />
				</div>
				<div className="flex-1 min-w-0 flex flex-col gap-0.5">
					<h2 className="text-sm font-semibold">Ask AI</h2>
					<p className="text-xs text-muted-foreground">Search documentation with AI</p>
				</div>
				<button
					type="button"
					onClick={onSwitchMode}
					className="cursor-pointer flex items-center gap-1.5 pl-3 pr-2 py-2 mr-2 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-md transition-colors shrink-0"
					title="Switch to keyword search"
				>
					<SearchIcon className="size-3.5" />
					<span>Search</span>
					<kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-xs font-medium text-sidebar-foreground/70">
						<span>
							{typeof navigator !== 'undefined' &&
							/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? (
								<span className="text-sm">⌘</span>
							) : (
								'Ctrl '
							)}
						</span>
						K
					</kbd>
				</button>
			</div>

			{/* Scrollable messages area */}
			<ScrollArea className="flex-1 min-h-0">
				<div className="px-4">
					<AISearchMessages
						messages={messages}
						loading={loading}
						onSourceClick={handleSourceClick}
					/>
				</div>
			</ScrollArea>

			{/* Input at bottom */}
			<div className="border-t px-4 pb-3 pt-3">
				<div className="flex items-end gap-2">
					<Textarea
						ref={textareaRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
								e.preventDefault();
								handleSend();
							}
						}}
						placeholder="Ask about Agentuity..."
						disabled={loading}
						rows={1}
						className="min-h-10 max-h-[150px] resize-none bg-muted/30"
					/>
					<button
						type="button"
						onClick={handleSend}
						disabled={loading || !input.trim()}
						className="inline-flex items-center justify-center size-10 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none"
						aria-label="Send"
					>
						<SendIcon className="size-4" />
					</button>
				</div>
				{/* Footer actions */}
				<div className="flex items-center gap-3 mt-2">
					<AISearchActions
						hasMessages={messages.length > 0}
						loading={loading}
						onRetry={handleRetry}
						onClear={handleClear}
					/>
					<span className="text-xs text-muted-foreground/60">
						Enter to send, Shift+Enter for newline
					</span>
				</div>
			</div>
		</>
	);
}
