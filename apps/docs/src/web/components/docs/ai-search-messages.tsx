import * as React from 'react';
import { RotateCcwIcon, SparklesIcon, Trash2Icon, UserIcon } from 'lucide-react';
import { Skeleton } from '../ui/index.ts';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIMessage } from '../../hooks/use-ai-search.ts';
import { ChatCodeBlock } from '../../components/ChatCodeBlock.tsx';

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
		<div className="flex flex-col space-y-6 py-3">
			{messages.map((msg) => (
				<MessageBubble key={msg.id} message={msg} onSourceClick={onSourceClick} />
			))}

			{loading && (
				<div className="flex justify-start">
					<div className="flex items-start gap-2 max-w-[85%]">
						<div className="bg-muted rounded-full p-1 mt-0.5 shrink-0">
							<SparklesIcon className="size-3 text-muted-foreground" />
						</div>
						<div className="bg-muted/50 rounded-lg px-3 py-3 space-y-2 w-64">
							<Skeleton className="h-3 w-full" />
							<Skeleton className="h-3 w-4/5" />
							<Skeleton className="h-3 w-3/5" />
						</div>
					</div>
				</div>
			)}

			<div ref={endRef} />
		</div>
	);
}

// Markdown components using shadcn typography patterns (scaled for chat context)
const markdownComponents = {
	h2: ({ children }: { children?: React.ReactNode }) => (
		<h2 className="text-base font-semibold tracking-tight [&:not(:first-child)]:mt-5 mb-2">
			{children}
		</h2>
	),
	h3: ({ children }: { children?: React.ReactNode }) => (
		<h3 className="text-sm font-semibold tracking-tight [&:not(:first-child)]:mt-4 mb-1.5">
			{children}
		</h3>
	),
	h4: ({ children }: { children?: React.ReactNode }) => (
		<h4 className="text-sm font-medium tracking-tight [&:not(:first-child)]:mt-3 mb-1">
			{children}
		</h4>
	),
	p: ({ children }: { children?: React.ReactNode }) => (
		<p className="text-sm leading-7 [&:not(:first-child)]:mt-3">{children}</p>
	),
	strong: ({ children }: { children?: React.ReactNode }) => (
		<strong className="font-semibold text-foreground">{children}</strong>
	),
	a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
		<a
			className="text-primary font-medium underline underline-offset-4 hover:opacity-80 transition-opacity"
			href={href}
			target={href?.startsWith('http') ? '_blank' : undefined}
			rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
		>
			{children}
		</a>
	),
	ul: ({ children }: { children?: React.ReactNode }) => (
		<ul className="my-3 ml-5 list-disc text-sm [&>li]:mt-1">{children}</ul>
	),
	ol: ({ children }: { children?: React.ReactNode }) => (
		<ol className="my-3 ml-5 list-decimal text-sm [&>li]:mt-1">{children}</ol>
	),
	li: ({ children }: { children?: React.ReactNode }) => <li className="leading-7">{children}</li>,
	blockquote: ({ children }: { children?: React.ReactNode }) => (
		<blockquote className="[&:not(:first-child)]:mt-3 border-l-2 pl-4 italic text-muted-foreground">
			{children}
		</blockquote>
	),
	table: ({ children }: { children?: React.ReactNode }) => (
		<div className="my-3 w-full overflow-x-auto">
			<table className="w-full text-xs">{children}</table>
		</div>
	),
	tr: ({ children }: { children?: React.ReactNode }) => (
		<tr className="even:bg-muted m-0 border-t p-0">{children}</tr>
	),
	th: ({ children }: { children?: React.ReactNode }) => (
		<th className="border px-3 py-1.5 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right">
			{children}
		</th>
	),
	td: ({ children }: { children?: React.ReactNode }) => (
		<td className="border px-3 py-1.5 text-left [&[align=center]]:text-center [&[align=right]]:text-right">
			{children}
		</td>
	),
	pre: ({ children }: { children: React.ReactNode }) => {
		// Extract code element from react-markdown output
		const codeElement = React.Children.toArray(children)[0] as
			| React.ReactElement<{
					className?: string;
					children?: React.ReactNode;
			  }>
			| undefined;

		if (codeElement?.props) {
			const className = codeElement.props.className || '';
			const match = /language-(\w+)/.exec(className);
			const language = match ? match[1] : 'typescript';
			const code = String(codeElement.props.children || '').replace(/\n$/, '');
			if (code) {
				return <ChatCodeBlock code={code} language={language} />;
			}
		}

		return (
			<pre className="my-2 overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs font-mono">
				{children}
			</pre>
		);
	},
	code: ({ children, className }: { children: React.ReactNode; className?: string }) => {
		if (!className) {
			return (
				<code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs">
					{children}
				</code>
			);
		}
		return <code className={className}>{children}</code>;
	},
};

function formatTime(date: Date): string {
	return date.toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	});
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
			<div className="flex justify-end items-start gap-2">
				<div className="max-w-[85%]">
					<div className="bg-accent rounded-lg px-3 py-2">
						<p className="text-sm">{message.content}</p>
					</div>
					<p className="text-[10px] text-muted-foreground mt-1 text-right">
						{formatTime(message.timestamp)}
					</p>
				</div>
				<div className="bg-muted rounded-full p-1 mt-0.5 shrink-0">
					<UserIcon className="size-3 text-muted-foreground" />
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
				<div className="min-w-0 flex-1">
					<div className="bg-muted/50 rounded-lg px-3 py-2.5">
						<Markdown remarkPlugins={[remarkGfm]} components={markdownComponents as any}>
							{message.content}
						</Markdown>
					</div>

					{message.sources && message.sources.length > 0 && (
						<div className="mt-2">
							<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
								Related
							</p>
							<div className="flex flex-col gap-1.5">
								{message.sources.map((source) => (
									<button
										key={source.id}
										type="button"
										onClick={() => onSourceClick(source.url)}
										className="w-full text-left px-3 py-2 text-sm font-medium rounded-lg ring-1 ring-foreground/10 bg-card text-card-foreground shadow-xs hover:bg-muted/50 transition-colors truncate"
									>
										{source.title}
									</button>
								))}
							</div>
						</div>
					)}

					<p className="text-[10px] text-muted-foreground mt-1">
						{formatTime(message.timestamp)}
					</p>
				</div>
			</div>
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
