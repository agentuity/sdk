import * as React from 'react';
import { Loader2, RotateCcwIcon, SendIcon, SparklesIcon, Trash2Icon, UserIcon } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIMessage } from '../../hooks/use-ai-search';

interface AISearchMessagesProps {
	messages: AIMessage[];
	loading: boolean;
	onSourceClick: (url: string) => void;
}

export function AISearchMessages({ messages, loading, onSourceClick }: AISearchMessagesProps) {
	const endRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages, loading]);

	if (messages.length === 0 && !loading) {
		return (
			<div className="flex flex-col items-center justify-center flex-1 min-h-full text-center">
				<div className="bg-muted rounded-full p-3 mb-3">
					<SparklesIcon className="size-5 text-muted-foreground" />
				</div>
				<p className="text-sm font-medium">Ask a question</p>
				<p className="text-xs text-muted-foreground mt-1 max-w-xs">
					Search our documentation or ask about Agentuity features
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 px-1 py-3">
			{messages.map((msg) => (
				<MessageBubble key={msg.id} message={msg} onSourceClick={onSourceClick} />
			))}

			{loading && (
				<div className="flex items-center gap-2 text-muted-foreground">
					<Loader2 className="size-3.5 animate-spin" />
					<span className="text-xs">Searching...</span>
				</div>
			)}

			<div ref={endRef} />
		</div>
	);
}

function MessageBubble({
	message,
	onSourceClick,
}: {
	message: AIMessage;
	onSourceClick: (url: string) => void;
}) {
	if (message.type === 'user') {
		return (
			<div className="flex justify-end">
				<div className="flex items-start gap-2 max-w-[85%]">
					<div className="bg-accent rounded-lg px-3 py-2">
						<p className="text-sm">{message.content}</p>
					</div>
					<div className="bg-muted rounded-full p-1 mt-0.5 shrink-0">
						<UserIcon className="size-3 text-muted-foreground" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-start">
			<div className="flex items-start gap-2 max-w-[85%]">
				<div className="bg-muted rounded-full p-1 mt-0.5 shrink-0">
					<SparklesIcon className="size-3 text-muted-foreground" />
				</div>
				<div>
					<div className="bg-muted/50 rounded-lg px-3 py-2">
						<div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-1 [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
							<Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
						</div>
					</div>

					{message.sources && message.sources.length > 0 && (
						<div className="mt-1.5 flex flex-wrap gap-1.5">
							{message.sources.map((source) => (
								<button
									key={source.id}
									type="button"
									onClick={() => onSourceClick(source.url)}
									className="text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded px-2 py-1 transition-colors"
								>
									{source.title}
								</button>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

interface AISearchInputProps {
	value: string;
	onChange: (value: string) => void;
	onSend: () => void;
	loading: boolean;
}

export function AISearchInput({ value, onChange, onSend, loading }: AISearchInputProps) {
	const inputRef = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		inputRef.current?.focus();
	}, []);

	React.useEffect(() => {
		if (!loading) {
			inputRef.current?.focus();
		}
	}, [loading]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
			e.preventDefault();
			onSend();
		}
	};

	return (
		<div className="flex items-center gap-2 px-3 py-2">
			<SparklesIcon className="size-4 shrink-0 opacity-50" />
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Ask about Agentuity..."
				disabled={loading}
				className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
			/>
			<button
				type="button"
				onClick={onSend}
				disabled={loading || !value.trim()}
				className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors shrink-0"
				aria-label="Send"
			>
				<SendIcon className="size-4" />
			</button>
		</div>
	);
}

interface AISearchActionsProps {
	hasMessages: boolean;
	loading: boolean;
	onRetry: () => void;
	onClear: () => void;
}

export function AISearchActions({ hasMessages, loading, onRetry, onClear }: AISearchActionsProps) {
	if (!hasMessages) return null;

	return (
		<div className="flex items-center gap-3">
			<button
				type="button"
				onClick={onRetry}
				disabled={loading}
				className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
			>
				<RotateCcwIcon className="size-3" />
				Retry
			</button>
			<button
				type="button"
				onClick={onClear}
				disabled={loading}
				className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
			>
				<Trash2Icon className="size-3" />
				Clear
			</button>
		</div>
	);
}
