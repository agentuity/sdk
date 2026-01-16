import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';

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

// Fixed prompt and tone used by the backend
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
	return scores.find((s) => s.provider.toLowerCase() === provider.toLowerCase());
}

function getProviderCheck(checks: ProviderBinary[], provider: string): ProviderBinary | undefined {
	return checks.find((c) => c.provider.toLowerCase() === provider.toLowerCase());
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

	const eventSourceRef = useRef<EventSource | null>(null);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			eventSourceRef.current?.close();
		};
	}, []);

	const startArena = useCallback(() => {
		// Close any existing connection
		eventSourceRef.current?.close();

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

		const eventSource = new EventSource('/api/model-arena/stream');
		eventSourceRef.current = eventSource;

		eventSource.onopen = () => {
			setState((prev) => ({ ...prev, status: 'generating' }));
		};

		// Handle start event
		eventSource.addEventListener('start', (event) => {
			const data = JSON.parse(event.data);
			setState((prev) => ({
				...prev,
				prompt: data.prompt,
				tone: data.tone,
				providers: data.providers,
			}));
		});

		// Handle story events
		eventSource.addEventListener('story', (event) => {
			const data = JSON.parse(event.data) as StoryResult;
			setState((prev) => {
				const newStories = new Map(prev.stories);
				newStories.set(data.provider, data);
				return { ...prev, stories: newStories };
			});
		});

		// Handle error events for individual providers
		eventSource.addEventListener('error', (event: Event) => {
			const messageEvent = event as MessageEvent;
			if (messageEvent.data) {
				try {
					const data = JSON.parse(messageEvent.data);
					if (data.provider) {
						setState((prev) => {
							const newErrors = new Map(prev.errors);
							newErrors.set(data.provider, data.error);
							return { ...prev, errors: newErrors };
						});
					} else {
						// Global error (e.g., judge failed)
						setState((prev) => ({
							...prev,
							status: 'error',
							globalError: data.error,
						}));
						eventSource.close();
					}
				} catch {
					// Parsing failed, treat as connection error
				}
			}
		});

		// Handle judging event
		eventSource.addEventListener('judging', () => {
			setState((prev) => ({ ...prev, status: 'judging' }));
		});

		// Handle complete event
		eventSource.addEventListener('complete', (event) => {
			const data = JSON.parse(event.data);
			setState((prev) => ({
				...prev,
				status: 'complete',
				judgment: data.judgment,
			}));
			eventSource.close();
		});

		// Handle connection errors
		eventSource.onerror = () => {
			if (eventSource.readyState === EventSource.CLOSED) {
				return;
			}
			setState((prev) => {
				if (prev.status === 'complete') return prev;
				return {
					...prev,
					status: 'error',
					globalError: 'Connection lost',
				};
			});
			eventSource.close();
		};
	}, []);

	const reset = useCallback(() => {
		eventSourceRef.current?.close();
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

	const isRunning =
		state.status === 'connecting' || state.status === 'generating' || state.status === 'judging';

	return (
		<div className="flex flex-col gap-4">
			{/* Models being compared */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-6">
				<div className="flex flex-col gap-4">
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Competitors
						</span>
						<div className="flex flex-wrap gap-2">
							<span className="px-3 py-2 rounded-md text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800">
								<span className="text-green-600 dark:text-green-400">OpenAI</span>
								<span className="text-zinc-500 mx-1">/</span>
								<span className="font-mono text-zinc-700 dark:text-zinc-300">
									gpt-5-nano
								</span>
							</span>
							<span className="px-3 py-2 rounded-md text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800">
								<span className="text-orange-600 dark:text-orange-400">Anthropic</span>
								<span className="text-zinc-500 mx-1">/</span>
								<span className="font-mono text-zinc-700 dark:text-zinc-300">
									claude-haiku-4-5
								</span>
							</span>
						</div>
					</div>
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Judge
						</span>
						<div className="flex flex-wrap gap-2">
							<span className="px-3 py-2 rounded-md text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800">
								<span className="text-purple-600 dark:text-purple-400">Groq</span>
								<span className="text-zinc-500 mx-1">/</span>
								<span className="font-mono text-zinc-700 dark:text-zinc-300">
									gpt-oss-120b
								</span>
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Action Section */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-6">
				<div className="flex flex-col gap-4">
					{/* Prompt display */}
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Prompt
						</span>
						<div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 text-sm px-3 py-2">
							{FIXED_PROMPT}
						</div>
					</div>

					{/* Tone display */}
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Tone
						</span>
						<span className="bg-zinc-200 dark:bg-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 text-xs px-3 py-1.5 capitalize inline-block">
							{FIXED_TONE}
						</span>
					</div>

					{/* Progress Stepper */}
					{state.status !== 'idle' && (
						<ProgressStepper
							status={state.status}
							storiesComplete={state.stories.size}
							storiesTotal={state.providers.length || 2}
						/>
					)}

					{/* Buttons */}
					<div className="flex gap-2">
						{!isRunning ? (
							<button
								onClick={startArena}
								type="button"
								className="rounded-md text-sm font-medium px-8 py-3 bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black cursor-pointer hover:bg-cyan-400 dark:hover:bg-cyan-300"
							>
								{state.status === 'idle' ? 'Generate Stories' : 'Run Again'}
							</button>
						) : (
							<button
								onClick={reset}
								type="button"
								className="rounded-md text-sm font-medium px-6 py-3 bg-red-600 dark:bg-red-900 text-white dark:text-red-300 cursor-pointer hover:bg-red-500 dark:hover:bg-red-800"
							>
								Stop
							</button>
						)}
						{(state.status === 'complete' || state.status === 'error') && (
							<button
								onClick={reset}
								type="button"
								className="bg-zinc-200 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-600 dark:text-zinc-400 text-sm px-4 py-3 cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600"
							>
								Clear
							</button>
						)}
					</div>
				</div>
			</div>

			{/* Global Error */}
			{state.globalError && (
				<div className="bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm p-4">
					Error: {state.globalError}
				</div>
			)}

			{/* Judge Reasoning */}
			{state.judgment && (
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-5">
					<div className="flex items-center gap-2 mb-3">
						<span className="text-zinc-500 dark:text-zinc-400 text-xs">JUDGE VERDICT</span>
						<span
							className={`rounded text-white text-[10px] font-semibold px-2 py-0.5 uppercase ${
								(
									PROVIDER_STYLES[state.judgment.winner.toLowerCase()] ??
									DEFAULT_PROVIDER_STYLE
								).bg
							}`}
						>
							{state.judgment.winnerDisplayName} wins
						</span>
					</div>
					<p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed m-0">
						{state.judgment.reasoning}
					</p>
				</div>
			)}

			{/* Results */}
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
								{/* Winner badge */}
								{isWinner && (
									<div
										className={`absolute top-0 right-0 text-white text-[10px] font-semibold px-2 py-1 uppercase rounded-bl-md ${providerStyle.bg}`}
									>
										Winner
									</div>
								)}

								{/* Header */}
								<div className="border-b border-zinc-200 dark:border-zinc-900 p-4">
									<div className="flex items-center gap-2 mb-1">
										<div className={`w-2 h-2 rounded-full ${providerStyle.bg}`} />
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

								{/* Story (scrollable) */}
								<div className="text-zinc-700 dark:text-zinc-300 flex-1 text-[13px] leading-relaxed max-h-[300px] overflow-y-auto p-4">
									{!story && !error && (
										<div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-600">
											<div className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
											Generating...
										</div>
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

								{/* Scores */}
								{state.judgment && story && (
									<div className="border-t border-zinc-200 dark:border-zinc-900 grid gap-2 grid-cols-2 p-4">
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
						{/* Step */}
						<div className="flex items-center gap-2">
							{/* Circle indicator */}
							<div className="relative">
								{/* Pulsing ring for active state */}
								{stepStatus === 'active' && (
									<div className="absolute inset-0 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-ping opacity-75" />
								)}
								<div
									className={`relative w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors ${
										stepStatus === 'complete'
											? 'bg-green-500 text-white'
											: stepStatus === 'active'
												? 'bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black'
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
							{/* Label */}
							<span
								className={`text-xs whitespace-nowrap ${
									stepStatus === 'active'
										? 'text-cyan-700 dark:text-cyan-400 font-medium'
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

						{/* Connector line */}
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
