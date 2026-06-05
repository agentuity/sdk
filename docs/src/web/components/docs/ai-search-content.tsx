import * as React from 'react';
import { SearchIcon, SendIcon, SparklesIcon } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { ScrollArea, Textarea } from '../ui';
import { useAISearch } from '../../hooks/use-ai-search';
import { AISearchMessages, AISearchActions } from './ai-search-messages';
import { SearchKeyboardShortcut } from './keyboard-shortcut';

interface AISearchContentProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSwitchMode: () => void;
}

export function AISearchContent({ open, onOpenChange, onSwitchMode }: AISearchContentProps) {
	const [input, setInput] = React.useState('');
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const navigate = useNavigate();
	const { messages, loading, sendMessage, handleClear, handleRetry } = useAISearch();

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
					<SearchKeyboardShortcut />
				</button>
			</div>

			<ScrollArea className="flex-1 min-h-0">
				<div className="px-4">
					<AISearchMessages
						messages={messages}
						loading={loading}
						onSourceClick={handleSourceClick}
					/>
				</div>
			</ScrollArea>

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
