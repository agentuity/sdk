import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { usePersistentDemoState } from '../hooks/usePersistentDemoState';
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
	StatusIndicator,
} from './ui';

interface StreamState {
	status: 'idle' | 'connecting' | 'streaming' | 'done' | 'error';
	content: string;
	tokenCount: number;
	isEstimate: boolean;
	error: string | null;
}

// Estimate token count from text (~4 chars per token for English text)
function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / 4);
}

const MODELS = [
	{ value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', provider: 'OpenAI' },
	{ value: 'gpt-5-mini', label: 'GPT-5 Mini', provider: 'OpenAI' },
	{ value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'Anthropic' },
	{ value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'Anthropic' },
	{ value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'Google' },
	{ value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', provider: 'Groq' },
];

function getProviderColor(provider: string): string {
	switch (provider) {
		case 'OpenAI':
			return 'text-green-600 dark:text-green-400';
		case 'Anthropic':
			return 'text-orange-600 dark:text-orange-400';
		case 'Google':
			return 'text-blue-600 dark:text-blue-400';
		case 'Groq':
			return 'text-purple-600 dark:text-purple-400';
		default:
			return 'text-zinc-500 dark:text-zinc-400';
	}
}

// Fixed prompt used by the backend
const FIXED_PROMPT = 'What are AI agents and how do they work?';

export function StreamingDemo() {
	const [model, setModel] = usePersistentDemoState<string>('streaming', 'model', {
		defaultValue: 'gpt-5.4-nano',
		storage: 'session',
	});
	const [state, setState] = useState<StreamState>({
		status: 'idle',
		content: '',
		tokenCount: 0,
		isEstimate: true,
		error: null,
	});

	const abortControllerRef = useRef<AbortController | null>(null);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			abortControllerRef.current?.abort();
		};
	}, []);

	const startStream = useCallback(async () => {
		// Abort any existing stream
		abortControllerRef.current?.abort();
		abortControllerRef.current = new AbortController();

		setState({
			status: 'connecting',
			content: '',
			tokenCount: 0,
			isEstimate: true,
			error: null,
		});

		try {
			const response = await fetch('/api/streaming/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model }),
				signal: abortControllerRef.current.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			if (!response.body) {
				throw new Error('No response body');
			}

			setState((prev) => ({ ...prev, status: 'streaming' }));

			const reader = response.body.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				setState((prev) => {
					const updatedContent = prev.content + chunk;
					return {
						...prev,
						content: updatedContent,
						tokenCount: estimateTokens(updatedContent),
						isEstimate: true,
					};
				});
			}

			// Raw streaming can't get actual token counts (headers sent before body)
			// Always show estimate for raw streams
			setState((prev) => ({
				...prev,
				status: 'done',
				isEstimate: true,
			}));
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				// User cancelled, don't show error
				return;
			}

			setState((prev) => ({
				...prev,
				status: 'error',
				error: error instanceof Error ? error.message : 'Unknown error',
			}));
		}
	}, [model]);

	const stopStream = useCallback(() => {
		abortControllerRef.current?.abort();
		setState((prev) => ({
			...prev,
			status: prev.content ? 'done' : 'idle',
		}));
	}, []);

	const reset = useCallback(() => {
		abortControllerRef.current?.abort();
		setState({
			status: 'idle',
			content: '',
			tokenCount: 0,
			isEstimate: true,
			error: null,
		});
	}, []);

	const isStreaming = state.status === 'streaming' || state.status === 'connecting';

	// Map StreamState status to StatusIndicator status type
	const getIndicatorStatus = (): 'idle' | 'pending' | 'running' | 'success' | 'error' => {
		switch (state.status) {
			case 'connecting':
				return 'pending';
			case 'streaming':
				return 'running';
			case 'done':
				return 'success';
			case 'error':
				return 'error';
			case 'idle':
			default:
				return 'idle';
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Input Section */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
				<div className="flex flex-col gap-4">
					{/* Prompt Display */}
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Prompt
						</span>
						<div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 text-sm px-3 py-2">
							{FIXED_PROMPT}
						</div>
					</div>

					{/* Model select and buttons */}
					<div className="flex gap-4 items-end flex-wrap">
						<div className="flex-1 min-w-[150px]">
							<label
								className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase"
								htmlFor="streaming-model-select"
							>
								Model
							</label>
							<Select value={model} onValueChange={setModel} disabled={isStreaming}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select a model..." />
								</SelectTrigger>
								<SelectContent>
									{MODELS.map((m) => (
										<SelectItem key={m.value} value={m.value}>
											{m.label} ({m.provider})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex gap-2 items-center">
							{!isStreaming ? (
								<Button onClick={startStream} variant="outline" size="default">
									Start Stream
								</Button>
							) : (
								<Button onClick={stopStream} variant="destructive" size="default">
									Stop
								</Button>
							)}
							{state.content && (
								<Button
									onClick={reset}
									disabled={isStreaming}
									variant="ghost"
									size="default"
								>
									Clear
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Output Section */}
			<div
				className={`bg-white dark:bg-black rounded-lg h-[300px] overflow-hidden flex flex-col ${
					state.status === 'error'
						? 'border border-red-300 dark:border-red-900'
						: 'border border-zinc-200 dark:border-zinc-900'
				}`}
			>
				{/* Status bar */}
				<div className="flex justify-between items-center px-4 py-3 flex-shrink-0">
					<div className="flex items-center gap-3">
						{(() => {
							const currentModel = MODELS.find((m) => m.value === model);
							return currentModel ? (
								<div className="flex items-center gap-1.5">
									<span
										className={`text-sm font-medium ${getProviderColor(currentModel.provider)}`}
									>
										{currentModel.provider}
									</span>
									<span className="text-zinc-500 text-sm">/</span>
									<span className="text-zinc-900 dark:text-white text-sm">
										{currentModel.label}
									</span>
								</div>
							) : null;
						})()}
						<StatusIndicator
							status={getIndicatorStatus()}
							label={state.status === 'connecting' ? 'Connecting...' : undefined}
						/>
					</div>
					{state.tokenCount > 0 && (
						<span className="text-zinc-500 dark:text-zinc-600 text-xs">
							{state.tokenCount} tokens{state.isEstimate ? ' (est.)' : ''}
						</span>
					)}
				</div>
				<Separator className="flex-shrink-0" />

				{/* Content area */}
				<div
					className={`text-sm leading-relaxed flex-1 overflow-y-auto p-4 ${
						state.status === 'error'
							? 'text-red-600 dark:text-red-300'
							: 'text-zinc-700 dark:text-zinc-300'
					}`}
				>
					{state.status === 'idle' && !state.content && (
						<span className="text-zinc-500 dark:text-zinc-600">
							Output will appear here as text streams in...
						</span>
					)}
					{state.status === 'error' && state.error}
					{state.content && (
						<Markdown
							components={{
								p: ({ children }) => <p className="my-2">{children}</p>,
								h1: ({ children }) => (
									<h1 className="text-lg font-semibold my-3 text-zinc-900 dark:text-white">
										{children}
									</h1>
								),
								h2: ({ children }) => (
									<h2 className="text-base font-semibold my-3 text-zinc-900 dark:text-white">
										{children}
									</h2>
								),
								h3: ({ children }) => (
									<h3 className="text-sm font-semibold my-2 text-zinc-900 dark:text-white">
										{children}
									</h3>
								),
								ul: ({ children }) => <ul className="list-disc pl-5 my-2">{children}</ul>,
								ol: ({ children }) => (
									<ol className="list-decimal pl-5 my-2">{children}</ol>
								),
								li: ({ children }) => <li className="my-0.5">{children}</li>,
								strong: ({ children }) => (
									<strong className="font-semibold text-zinc-900 dark:text-white">
										{children}
									</strong>
								),
								em: ({ children }) => <em className="italic">{children}</em>,
								code: ({ children }) => (
									<code className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded text-cyan-800 dark:text-cyan-400 text-xs">
										{children}
									</code>
								),
							}}
						>
							{state.content}
						</Markdown>
					)}
					{state.status === 'streaming' && (
						<span className="inline-block w-0.5 h-4 bg-cyan-500 ml-0.5 animate-pulse" />
					)}
				</div>
			</div>
		</div>
	);
}
