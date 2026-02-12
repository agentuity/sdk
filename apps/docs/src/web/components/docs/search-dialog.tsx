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
	SearchIcon,
	SendIcon,
	SparklesIcon,
	UsersIcon,
	XIcon,
	type LucideIcon,
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	ScrollArea,
	Textarea,
} from '../ui';
import { cn } from '../../lib/utils';
import { navData, type NavItem } from './nav-data';
import { useAISearch } from '../../hooks/use-ai-search';
import { AISearchMessages, AISearchActions } from './ai-search-messages';

const MODE_STORAGE_KEY = 'agentuity-search-mode';

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
	depth: number = 0,
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
				</CommandItem>,
			);
		} else if (item.items) {
			nodes.push(
				<div
					key={`label-${item.title}`}
					className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground/70"
					style={{ paddingLeft: `${12 + indent}px` }}
				>
					{item.title}
				</div>,
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
	const allItems = React.useMemo(() => getAllItems(), []);

	const handleSelect = (url: string) => {
		onSelect(url.slice(1));
		onOpenChange(false);
	};

	const groupedItems = React.useMemo(() => {
		const groups: Record<string, SearchItem[]> = {};
		for (const item of allItems) {
			if (!groups[item.section]) {
				groups[item.section] = [];
			}
			groups[item.section]!.push(item);
		}
		return groups;
	}, [allItems]);

	return (
		<Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
			<div className="flex items-center [&>[data-slot=command-input-wrapper]]:flex-1 [&>[data-slot=command-input-wrapper]]:border-b-0 border-b">
				<CommandInput placeholder="Search pages..." value={search} onValueChange={setSearch} />
				<kbd className="pointer-events-none inline-flex h-5 select-none items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground mr-2">
					ESC
				</kbd>
				<button
					type="button"
					onClick={onSwitchMode}
					className="flex items-center gap-1.5 px-3 py-2 mr-2 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-md transition-colors shrink-0"
					title="Switch to Ask AI"
				>
					<SparklesIcon className="size-3.5" />
					<span>Ask AI</span>
				</button>
			</div>
			<CommandList className="max-h-[400px]">
				{search.trim() ? (
					<>
						<CommandEmpty>No results found.</CommandEmpty>
						{Object.entries(groupedItems).map(([section, items]) => {
							const Icon = sectionIcons[section] ?? FileTextIcon;
							return (
								<CommandGroup key={section} heading={section}>
									{items.map((item) => (
										<CommandItem
											key={item.url}
											value={`${item.title} ${item.description ?? ''} ${item.section}`}
											onSelect={() => handleSelect(item.url)}
											className="items-start py-2.5"
										>
											<Icon className="mr-3 size-4 shrink-0 mt-0.5" />
											<div className="flex flex-col gap-0.5 min-w-0 flex-1">
												<span className="text-sm font-medium truncate">{item.title}</span>
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
			<div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b">
				<div className="bg-muted rounded-lg p-2 shrink-0">
					<SparklesIcon className="size-4 text-muted-foreground" />
				</div>
				<div className="flex-1 min-w-0 flex flex-col gap-0.5">
					<h2 className="text-sm font-semibold">Ask AI</h2>
					<p className="text-xs text-muted-foreground">
						Search documentation with AI
					</p>
				</div>
				<button
					type="button"
					onClick={onSwitchMode}
					className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-md hover:bg-accent transition-colors shrink-0"
					title="Switch to keyword search"
				>
					<SearchIcon className="size-3.5" />
					<span>Search</span>
				</button>
				<DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shrink-0">
					<XIcon className="size-4" />
					<span className="sr-only">Close</span>
				</DialogClose>
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
					<span className={cn("text-[10px] text-muted-foreground", !input.trim() && "invisible")}>
						Enter to send, Shift+Enter for newline
					</span>
				</div>
			</div>
		</>
	);
}
