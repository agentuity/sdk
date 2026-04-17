import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Badge, Button, Separator, StatusIndicator } from './ui';

interface ProviderInfo {
	provider: string;
	displayName: string;
	model: string;
}

interface StoryResult {
	provider: string;
	displayName: string;
	model: string;
	story: string;
	generationMs: number;
	tokens: number;
}

interface ProviderScore {
	provider: string;
	score: number;
	reason: string;
}

interface ProviderBinary {
	provider: string;
	passed: boolean;
	reason: string;
}

interface Judgment {
	winner: string;
	winnerDisplayName: string;
	reasoning: string;
	scores: {
		creativity: ProviderScore[];
		engagement: ProviderScore[];
	};
	checks: {
		toneMatch: ProviderBinary[];
		wordCount: ProviderBinary[];
	};
}

interface StreamEventMap {
	start: {
		prompt: string;
		tone: string;
		providers: ProviderInfo[];
	};
	story: StoryResult;
	'provider-error': {
		provider: string;
		displayName: string;
		error: string;
	};
	judging: {
		count: number;
	};
	complete: {
		judgment: Judgment;
	};
	error: {
		error: string;
	};
	heartbeat: number;
}

type StreamEvent = {
	[K in keyof StreamEventMap]: {
		event: K;
		data: StreamEventMap[K];
	};
}[keyof StreamEventMap];

type ArenaStatus = 'idle' | 'connecting' | 'generating' | 'judging' | 'complete' | 'error';

interface ArenaState {
	status: ArenaStatus;
	prompt: string | null;
	tone: string | null;
	providers: ProviderInfo[];
	stories: Map<string, StoryResult>;
	errors: Map<string, string>;
	judgment: Judgment | null;
	globalError: string | null;
}

const FIXED_PROMPT = 'A robot discovers it can dream';
const FIXED_TONE = 'sci-fi';

const PROVIDER_STYLES: Record<string, { bg: string; border: string; text: string }> = {
	openai: {
		bg: 'bg-green-600 dark:bg-green-500',
		border: 'border-green-600 dark:border-green-500',
		text: 'text-green-600 dark:text-green-400',
	},
	anthropic: {
		bg: 'bg-orange-500 dark:bg-orange-400',
		border: 'border-orange-500 dark:border-orange-400',
		text: 'text-orange-600 dark:text-orange-400',
	},
};

const DEFAULT_PROVIDER_STYLE = {
	bg: 'bg-zinc-500',
	border: 'border-zinc-500',
	text: 'text-zinc-500',
};

function getProviderScore(scores: ProviderScore[], provider: string): ProviderScore | undefined {
	return scores.find((score) => score.provider.toLowerCase() === provider.toLowerCase());
}

function getProviderCheck(checks: ProviderBinary[], provider: string): ProviderBinary | undefined {
	return checks.find((check) => check.provider.toLowerCase() === provider.toLowerCase());
}

function formatTime(ms: number): string {
	return `${(ms / 1000).toFixed(2)}s`;
}

export function ModelArena() {
	const [state, setState] = useState<ArenaState>({
		status: 'idle',
		prompt: null,
		tone: null,
		providers: [],
		stories: new Map(),
		errors: new Map(),
		judgment: null,
		globalError: null,
	});

	const abortControllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => {
			abortControllerRef.current?.abort();
		};
	}, []);

	const applyEvent = useCallback((event: StreamEvent) => {
		switch (event.event) {
			case 'start':
				setState((prev) => ({
					...prev,
					status: 'generating',
					prompt: event.data.prompt,
					tone: event.data.tone,
					providers: event.data.providers,
				}));
				return;
			case 'story':
				setState((prev) => {
					const stories = new Map(prev.stories);
					stories.set(event.data.provider, event.data);
					return {
						...prev,
						status: 'generating',
						stories,
					};
				});
				return;
			case 'provider-error':
				setState((prev) => {
					const errors = new Map(prev.errors);
					errors.set(event.data.provider, event.data.error);
					return {
						...prev,
						status: 'generating',
						errors,
					};
				});
				return;
			case 'judging':
				setState((prev) => ({
					...prev,
					status: 'judging',
				}));
				return;
			case 'complete':
				setState((prev) => ({
					...prev,
					status: 'complete',
					judgment: event.data.judgment,
				}));
				return;
			case 'error':
				setState((prev) => ({
					...prev,
					status: 'error',
					globalError: event.data.error,
				}));
				return;
			case 'heartbeat':
				return;
		}
	}, []);

	const startArena = useCallback(async () => {
		abortControllerRef.current?.abort();

		const abortController = new AbortController();
		abortControllerRef.current = abortController;

		setState({
			status: 'connecting',
			prompt: null,
			tone: null,
			providers: [],
			stories: new Map(),
			errors: new Map(),
			judgment: null,
			globalError: null,
		});

		try {
			const response = await fetch('/api/model-arena/stream', {
				signal: abortController.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			if (!response.body) {
				throw new Error('No response body');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let sawTerminalEvent = false;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.trim()) {
						continue;
					}

					const event = JSON.parse(line) as StreamEvent;
					if (event.event === 'complete' || event.event === 'error') {
						sawTerminalEvent = true;
					}
					applyEvent(event);
				}
			}

			if (!abortController.signal.aborted && !sawTerminalEvent) {
				setState((prev) => ({
					...prev,
					status: 'error',
					globalError: 'Connection lost',
				}));
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				return;
			}

			setState((prev) => ({
				...prev,
				status: 'error',
				globalError: error instanceof Error ? error.message : 'Unknown error',
			}));
		}
	}, [applyEvent]);

	const reset = useCallback(() => {
		abortControllerRef.current?.abort();
		setState({
			status: 'idle',
			prompt: null,
			tone: null,
			providers: [],
			stories: new Map(),
			errors: new Map(),
			judgment: null,
			globalError: null,
		});
	}, []);

	const stop = useCallback(() => {
		abortControllerRef.current?.abort();
		setState((prev) => ({
			...prev,
			status: prev.stories.size > 0 || prev.errors.size > 0 ? 'error' : 'idle',
			globalError:
				prev.stories.size > 0 || prev.errors.size > 0 ? 'Run stopped before completion' : null,
		}));
	}, []);

	const isRunning =
		state.status === 'connecting' || state.status === 'generating' || state.status === 'judging';

	return (
		<div className="flex flex-col gap-4">
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-6">
				<div className="flex flex-col gap-4">
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Competitors
						</span>
						<div className="flex flex-wrap gap-2">
							<Badge variant="outline">
								<span className="text-green-600 dark:text-green-400">OpenAI</span>
								<span className="text-zinc-500 mx-1">/</span>
								<span className="font-mono text-zinc-700 dark:text-zinc-300">
									gpt-5.4-nano
								</span>
							</Badge>
							<Badge variant="outline">
								<span className="text-orange-600 dark:text-orange-400">Anthropic</span>
								<span className="text-zinc-500 mx-1">/</span>
								<span className="font-mono text-zinc-700 dark:text-zinc-300">
									claude-haiku-4-5
								</span>
							</Badge>
						</div>
					</div>
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Judge
						</span>
						<div className="flex flex-wrap gap-2">
							<Badge variant="outline">
								<span className="text-purple-600 dark:text-purple-400">Groq</span>
								<span className="text-zinc-500 mx-1">/</span>
								<span className="font-mono text-zinc-700 dark:text-zinc-300">
									gpt-oss-120b
								</span>
							</Badge>
						</div>
					</div>
				</div>
			</div>

			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-6">
				<div className="flex flex-col gap-4">
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Prompt
						</span>
						<div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 text-sm px-3 py-2">
							{FIXED_PROMPT}
						</div>
					</div>

					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Tone
						</span>
						<span className="bg-zinc-200 dark:bg-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 text-xs px-3 py-1.5 capitalize inline-block">
							{FIXED_TONE}
						</span>
					</div>

					{state.status !== 'idle' && (
						<ProgressStepper
							status={state.status}
							storiesComplete={state.stories.size}
							storiesTotal={state.providers.length || 2}
						/>
					)}

					<div className="flex items-center gap-2">
						{!isRunning ? (
							<Button onClick={startArena} variant="outline" size="default">
								{state.status === 'idle' ? 'Generate Stories' : 'Run Again'}
							</Button>
						) : (
							<Button onClick={stop} variant="destructive" size="default">
								Stop
							</Button>
						)}
						{(state.status === 'complete' || state.status === 'error') && (
							<Button onClick={reset} variant="ghost" size="default">
								Clear
							</Button>
						)}
					</div>
				</div>
			</div>

			{state.globalError && (
				<div className="bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm p-4">
					Error: {state.globalError}
				</div>
			)}

			{state.judgment && (
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-5">
					<div className="flex items-center gap-2 mb-3">
						<span className="text-zinc-500 dark:text-zinc-400 text-xs">JUDGE VERDICT</span>
						<Badge variant="success">{state.judgment.winnerDisplayName} wins</Badge>
					</div>
					<p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed m-0">
						{state.judgment.reasoning}
					</p>
				</div>
			)}

			{state.providers.length > 0 && (
				<div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
					{state.providers.map((provider) => {
						const story = state.stories.get(provider.provider);
						const error = state.errors.get(provider.provider);
						const isWinner =
							state.judgment?.winner.toLowerCase() === provider.provider.toLowerCase();
						const providerStyle =
							PROVIDER_STYLES[provider.provider] ?? DEFAULT_PROVIDER_STYLE;

						return (
							<div
								key={provider.provider}
								className={`bg-white dark:bg-black rounded-lg flex flex-col overflow-hidden relative border ${
									isWinner ? providerStyle.border : 'border-zinc-200 dark:border-zinc-800'
								}`}
							>
								{isWinner && (
									<div className="absolute top-0 right-0">
										<Badge
											variant="success"
											className="rounded-bl-md rounded-br-none rounded-tl-none"
										>
											Winner
										</Badge>
									</div>
								)}

								<div className="p-4">
									<div className="flex items-center gap-1.5 mb-1">
										<span className={`text-sm font-medium ${providerStyle.text}`}>
											{provider.provider.charAt(0).toUpperCase() +
												provider.provider.slice(1)}
										</span>
										<span className="text-zinc-500 text-sm">/</span>
										<span className="text-zinc-900 dark:text-white text-sm font-medium">
											{provider.displayName}
										</span>
									</div>
									<div className="text-zinc-500 dark:text-zinc-600 text-xs">
										{provider.model}
										{story &&
											` \u00B7 ${formatTime(story.generationMs)}${story.tokens ? ` \u00B7 ${story.tokens} tokens` : ''}`}
									</div>
								</div>
								<Separator />

								<div className="text-zinc-700 dark:text-zinc-300 flex-1 text-[13px] leading-relaxed max-h-[300px] overflow-y-auto p-4">
									{!story && !error && isRunning && (
										<StatusIndicator
											status="running"
											label="Generating..."
											showLabel={true}
										/>
									)}
									{error && (
										<div className="text-red-600 dark:text-red-400">Error: {error}</div>
									)}
									{story && (
										<Markdown
											components={{
												p: ({ children }) => <p className="my-2">{children}</p>,
												h1: ({ children }) => (
													<h1 className="text-base font-semibold my-2 text-zinc-900 dark:text-white">
														{children}
													</h1>
												),
												h2: ({ children }) => (
													<h2 className="text-sm font-semibold my-2 text-zinc-900 dark:text-white">
														{children}
													</h2>
												),
												strong: ({ children }) => (
													<strong className="font-semibold text-zinc-900 dark:text-white">
														{children}
													</strong>
												),
												em: ({ children }) => <em className="italic">{children}</em>,
											}}
										>
											{story.story}
										</Markdown>
									)}
								</div>

								{state.judgment && story && (
									<>
										<Separator />
										<div className="grid gap-2 grid-cols-2 p-4">
											<ScoreBadge
												label="Creativity"
												score={getProviderScore(
													state.judgment.scores.creativity,
													provider.provider
												)}
											/>
											<ScoreBadge
												label="Engagement"
												score={getProviderScore(
													state.judgment.scores.engagement,
													provider.provider
												)}
											/>
											<BinaryBadge
												label="Tone"
												check={getProviderCheck(
													state.judgment.checks.toneMatch,
													provider.provider
												)}
											/>
											<BinaryBadge
												label="Word Count"
												check={getProviderCheck(
													state.judgment.checks.wordCount,
													provider.provider
												)}
											/>
										</div>
									</>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function ScoreBadge({ label, score }: { label: string; score?: ProviderScore }) {
	const value = score?.score ?? 0;
	const displayValue = `${Math.round(value * 100)}%`;
	const bgClass =
		value >= 0.7
			? 'bg-green-500/15 text-green-600 dark:text-green-400'
			: value >= 0.4
				? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
				: 'bg-red-500/15 text-red-600 dark:text-red-400';

	return (
		<div className="flex items-center gap-2 justify-between" title={score?.reason}>
			<span className="text-zinc-500 text-xs">{label}</span>
			<span className={`text-xs font-medium font-mono px-1.5 py-0.5 rounded ${bgClass}`}>
				{displayValue}
			</span>
		</div>
	);
}

function BinaryBadge({ label, check }: { label: string; check?: ProviderBinary }) {
	const passed = check?.passed ?? false;
	const bgClass = passed
		? 'bg-green-500/15 text-green-600 dark:text-green-400'
		: 'bg-red-500/15 text-red-600 dark:text-red-400';

	return (
		<div className="flex items-center gap-2 justify-between" title={check?.reason}>
			<span className="text-zinc-500 text-xs">{label}</span>
			<span className={`text-xs font-medium px-1.5 py-0.5 rounded ${bgClass}`}>
				{passed ? 'Pass' : 'Fail'}
			</span>
		</div>
	);
}

function ProgressStepper({
	status,
	storiesComplete,
	storiesTotal,
}: {
	status: ArenaStatus;
	storiesComplete: number;
	storiesTotal: number;
}) {
	const steps = [
		{
			id: 'generate',
			label: 'Generate Stories',
			detail:
				status === 'generating' || status === 'connecting'
					? `${storiesComplete}/${storiesTotal}`
					: status === 'judging' || status === 'complete'
						? `${storiesTotal}/${storiesTotal}`
						: null,
		},
		{
			id: 'judge',
			label: 'Judge Evaluation',
			detail: null,
		},
	];

	const getStepStatus = (stepId: string) => {
		if (status === 'error') {
			if (stepId === 'generate' && storiesComplete > 0) return 'complete';
			if (stepId === 'generate') return 'error';
			return 'pending';
		}

		switch (stepId) {
			case 'generate':
				if (status === 'connecting' || status === 'generating') return 'active';
				if (status === 'judging' || status === 'complete') return 'complete';
				return 'pending';
			case 'judge':
				if (status === 'judging') return 'active';
				if (status === 'complete') return 'complete';
				return 'pending';
			default:
				return 'pending';
		}
	};

	return (
		<div className="flex items-center gap-1">
			{steps.map((step, index) => {
				const stepStatus = getStepStatus(step.id);
				const isLast = index === steps.length - 1;
				const nextStep = steps[index + 1];
				const nextStepStatus = nextStep ? getStepStatus(nextStep.id) : 'pending';

				return (
					<div key={step.id} className="flex items-center">
						<div className="flex items-center gap-2">
							<div className="relative">
								{stepStatus === 'active' && (
									<div className="absolute inset-0 rounded-full bg-cyan-500 animate-ping opacity-75" />
								)}
								<div
									className={`relative w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors ${
										stepStatus === 'complete'
											? 'bg-green-500 text-white'
											: stepStatus === 'active'
												? 'bg-cyan-500 text-white dark:text-black'
												: stepStatus === 'error'
													? 'bg-red-500 text-white'
													: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500'
									}`}
								>
									{stepStatus === 'complete' ? (
										<svg
											className="w-3 h-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={3}
												d="M5 13l4 4L19 7"
											/>
										</svg>
									) : stepStatus === 'active' ? (
										<div className="w-1.5 h-1.5 rounded-full bg-current" />
									) : (
										index + 1
									)}
								</div>
							</div>
							<span
								className={`text-xs whitespace-nowrap ${
									stepStatus === 'active'
										? 'text-cyan-600 dark:text-cyan-400 font-medium'
										: stepStatus === 'complete'
											? 'text-zinc-600 dark:text-zinc-400'
											: 'text-zinc-400 dark:text-zinc-600'
								}`}
							>
								{step.label}
								{step.detail && (
									<span className="text-zinc-500 dark:text-zinc-500 ml-1">
										({step.detail})
									</span>
								)}
							</span>
						</div>

						{!isLast && (
							<div
								className={`w-6 h-0.5 mx-2 transition-colors ${
									nextStepStatus !== 'pending'
										? 'bg-green-500'
										: stepStatus === 'complete' || stepStatus === 'active'
											? 'bg-zinc-300 dark:bg-zinc-700'
											: 'bg-zinc-200 dark:bg-zinc-800'
								}`}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
