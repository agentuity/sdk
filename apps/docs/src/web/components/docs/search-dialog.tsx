import * as React from 'react';
import { FileTextIcon, LayoutGridIcon, SearchIcon, SendIcon, SparklesIcon, XIcon } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import {
	CommandDialog,
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
} from '../ui';
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

// Recursively collect all leaf nav items with URLs
function collectItems(items: NavItem[], section: string): Array<NavItem & { section: string; url: string }> {
	const result: Array<NavItem & { section: string; url: string }> = [];
	for (const item of items) {
		if (item.url) {
			result.push({ ...item, url: item.url, section });
		}
		if (item.items) {
			result.push(...collectItems(item.items, section));
		}
	}
	return result;
}

// Flatten nav data for search
function getAllItems(): Array<NavItem & { section: string; url: string }> {
	const items: Array<NavItem & { section: string; url: string }> = [];
	for (const section of navData) {
		items.push(...collectItems(section.items, section.title));
	}
	return items;
}

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

	if (mode === 'ai') {
		return (
			<AISearchPanel
				open={open}
				onOpenChange={onOpenChange}
				onSwitchMode={() => handleModeChange('search')}
			/>
		);
	}

	return (
		<KeywordSearchPanel
			open={open}
			onOpenChange={onOpenChange}
			onSelect={onSelect}
			onSwitchMode={() => handleModeChange('ai')}
		/>
	);
}

// --- Keyword Search (existing behavior, with Ask AI toggle) ---

function KeywordSearchPanel({
	open,
	onOpenChange,
	onSelect,
	onSwitchMode,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (page: string) => void;
	onSwitchMode: () => void;
}) {
	const allItems = React.useMemo(() => getAllItems(), []);

	const handleSelect = (url: string) => {
		onSelect(url.slice(1));
		onOpenChange(false);
	};

	const groupedItems = React.useMemo(() => {
		const groups: Record<string, Array<NavItem & { section: string; url: string }>> = {};
		for (const item of allItems) {
			if (!groups[item.section]) {
				groups[item.section] = [];
			}
			groups[item.section]!.push(item);
		}
		return groups;
	}, [allItems]);

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Search"
			description="Search for pages and demos"
			showCloseButton={false}
		>
			<div className="flex items-center [&>[data-slot=command-input-wrapper]]:flex-1 [&>[data-slot=command-input-wrapper]]:border-b-0 border-b">
				<CommandInput placeholder="Search pages..." />
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
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>
				{Object.entries(groupedItems).map(([section, items]) => (
					<CommandGroup key={section} heading={section}>
						{items.map((item) => (
							<CommandItem
								key={item.url}
								value={`${item.title} ${section}`}
								onSelect={() => handleSelect(item.url)}
							>
								{section === 'SDK Explorer' ? (
									<LayoutGridIcon className="mr-2 size-4" />
								) : (
									<FileTextIcon className="mr-2 size-4" />
								)}
								<span>{item.title}</span>
							</CommandItem>
						))}
					</CommandGroup>
				))}
			</CommandList>
		</CommandDialog>
	);
}

// --- AI Search Panel ---

function AISearchPanel({
	open,
	onOpenChange,
	onSwitchMode,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSwitchMode: () => void;
}) {
	const [input, setInput] = React.useState('');
	const inputRef = React.useRef<HTMLInputElement>(null);
	const navigate = useNavigate();
	const { messages, loading, sendMessage, handleClear, handleRetry } = useAISearch();

	// Focus input when dialog opens and after loading completes
	React.useEffect(() => {
		if (open) {
			// Delay to let the dialog animation settle
			const timer = setTimeout(() => inputRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [open]);

	React.useEffect(() => {
		if (!loading) {
			inputRef.current?.focus();
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 flex flex-col max-h-[70vh] sm:max-w-xl" showCloseButton={false}>
				{/* Header */}
				<div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b">
					<div className="bg-muted rounded-lg p-2 shrink-0">
						<SparklesIcon className="size-4 text-muted-foreground" />
					</div>
					<DialogHeader className="flex-1 min-w-0 gap-0.5">
						<DialogTitle className="text-sm font-semibold">Search Documentation</DialogTitle>
						<DialogDescription className="text-xs">
							Ask questions about Agentuity
						</DialogDescription>
					</DialogHeader>
					<DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shrink-0">
						<XIcon className="size-4" />
						<span className="sr-only">Close</span>
					</DialogClose>
				</div>

				{/* Scrollable messages area */}
				<div className="flex flex-col flex-1 overflow-y-auto px-4 min-h-[250px] max-h-[350px]">
					<AISearchMessages
						messages={messages}
						loading={loading}
						onSourceClick={handleSourceClick}
					/>
				</div>

				{/* Input at bottom */}
				<div className="border-t px-4 pb-3 pt-3">
					<div className="flex items-center gap-2">
						<div className="flex-1 flex items-center rounded-md border bg-muted/30 px-3">
							<input
								ref={inputRef}
								type="text"
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
								className="flex h-10 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
							/>
						</div>
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
					<div className="flex items-center justify-between mt-2">
						<AISearchActions
							hasMessages={messages.length > 0}
							loading={loading}
							onRetry={handleRetry}
							onClear={handleClear}
						/>
						<button
							type="button"
							onClick={onSwitchMode}
							className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-md transition-colors shrink-0"
							title="Switch to keyword search"
						>
							<SearchIcon className="size-3.5" />
							<span>Search</span>
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
