import { useCallback, useEffect, useRef, useState } from 'react';

interface EvalResultData {
	passed: boolean;
	score?: number;
	reason?: string;
}

interface EvalRun {
	id: string;
	evalId: string;
	pending: boolean;
	success: boolean;
	error: string | null;
	result: EvalResultData | null;
}

interface SessionResponse {
	sessionId: string;
	pending: boolean;
	evalResults: EvalRun[];
}

type Status = 'idle' | 'generating' | 'polling' | 'done' | 'error';

const EVAL_CONFIG: Record<string, { name: string; type: 'score' | 'binary' }> = {
	'answer-completeness': { name: 'Answer Completeness', type: 'score' },
	'factual-claims': { name: 'Factual Claims', type: 'binary' },
};

// Max polling attempts (30 seconds at 2 second intervals)
const MAX_POLL_ATTEMPTS = 15;

export function EvalsDemo() {
	const [status, setStatus] = useState<Status>('idle');
	const [generatedContent, setGeneratedContent] = useState('');
	const [sessionId, setSessionId] = useState('');
	const [evalResults, setEvalResults] = useState<EvalRun[]>([]);
	const [error, setError] = useState('');
	const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pollCountRef = useRef(0);
	const abortControllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => {
			if (pollingRef.current) clearTimeout(pollingRef.current);
			abortControllerRef.current?.abort();
		};
	}, []);

	const pollSession = useCallback(async (sid: string) => {
		// Check max polling attempts
		pollCountRef.current++;
		if (pollCountRef.current > MAX_POLL_ATTEMPTS) {
			setError('Evaluation timed out after 30 seconds');
			setStatus('error');
			return;
		}

		try {
			const response = await fetch(`/api/evals/session/${sid}`, {
				signal: abortControllerRef.current?.signal,
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);

			const data: SessionResponse = await response.json();
			setEvalResults(data.evalResults);

			const allDone = data.evalResults.every((r) => !r.pending);
			if (allDone && data.evalResults.length > 0) {
				setStatus('done');
			} else {
				pollingRef.current = setTimeout(() => pollSession(sid), 2000);
			}
		} catch (err) {
			// Ignore abort errors (component unmounted)
			if (err instanceof Error && err.name === 'AbortError') return;
			setError(err instanceof Error ? err.message : 'Polling failed');
			setStatus('error');
		}
	}, []);

	const generate = useCallback(async () => {
		// Abort any previous request and reset state
		abortControllerRef.current?.abort();
		abortControllerRef.current = new AbortController();
		pollCountRef.current = 0;

		setStatus('generating');
		setError('');
		setGeneratedContent('');
		setEvalResults([]);
		setSessionId('');

		try {
			const response = await fetch('/api/evals', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: abortControllerRef.current.signal,
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);

			const data = await response.json();
			setGeneratedContent(data.content);
			setSessionId(data.sessionId);
			setStatus('polling');
			pollSession(data.sessionId);
		} catch (err) {
			// Ignore abort errors (component unmounted or new request started)
			if (err instanceof Error && err.name === 'AbortError') return;
			setError(err instanceof Error ? err.message : 'Generation failed');
			setStatus('error');
		}
	}, [pollSession]);

	const getEvalConfig = (evalId: string) =>
		EVAL_CONFIG[evalId] ?? { name: evalId, type: 'binary' };

	return (
		<div className="flex flex-col gap-4">
			{/* Generate Button */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-6">
				<div className="flex flex-col gap-4">
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Explainer
						</span>
						<div className="flex flex-wrap gap-2">
							<span className="px-3 py-2 rounded-md text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800">
								<span className="text-green-600 dark:text-green-400">OpenAI</span>
								<span className="text-zinc-500 mx-1">/</span>
								<span className="font-mono text-zinc-700 dark:text-zinc-300">
									gpt-5-nano
								</span>
							</span>
						</div>
					</div>
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Evaluator
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
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Prompt
						</span>
						<div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 text-sm px-3 py-2">
							Explain what AI is and how it works in a few brief sentences
						</div>
					</div>
					<button
						onClick={generate}
						disabled={status === 'generating' || status === 'polling'}
						type="button"
						className={`rounded-md text-sm font-medium px-6 py-3 self-start ${
							status === 'generating' || status === 'polling'
								? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-600 cursor-not-allowed'
								: 'bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black cursor-pointer hover:bg-cyan-400 dark:hover:bg-cyan-300'
						}`}
					>
						{status === 'generating' ? (
							<span data-loading="true">Generating</span>
						) : status === 'polling' ? (
							<span data-loading="true">Running Evals</span>
						) : (
							'Generate Explanation'
						)}
					</button>
				</div>
			</div>

			{error && (
				<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
					<p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
				</div>
			)}

			{status === 'generating' && (
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden animate-pulse">
					<div className="border-b border-zinc-200 dark:border-zinc-900 px-4 py-3">
						<div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded" />
					</div>
					<div className="p-4 space-y-2">
						<div className="h-4 w-full bg-zinc-200 dark:bg-zinc-800 rounded" />
						<div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded" />
						<div className="h-4 w-5/6 bg-zinc-200 dark:bg-zinc-800 rounded" />
					</div>
				</div>
			)}

			{generatedContent && (
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden">
					<div className="border-b border-zinc-200 dark:border-zinc-900 px-4 py-3 flex justify-between items-center">
						<span className="text-zinc-900 dark:text-white font-medium">
							Generated Response
						</span>
						{sessionId && (
							<span className="text-zinc-500 text-xs font-mono">
								{sessionId.slice(0, 20)}...
							</span>
						)}
					</div>
					<div className="p-4">
						<p className="text-zinc-700 dark:text-zinc-300 text-sm whitespace-pre-wrap">
							{generatedContent}
						</p>
					</div>
				</div>
			)}

			{(status === 'polling' || status === 'done') && (
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden">
					<div className="border-b border-zinc-200 dark:border-zinc-900 px-4 py-3 flex justify-between items-center">
						<span className="text-zinc-900 dark:text-white font-medium">
							Evaluation Results
						</span>
						{status === 'done' && (
							<span className="text-green-600 dark:text-green-400 text-xs">Complete</span>
						)}
					</div>
					<div className="p-4 space-y-4">
						{evalResults.length === 0 && status === 'polling' && (
							<>
								{[1, 2].map((i) => (
									<div
										key={i}
										className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 animate-pulse"
									>
										<div className="flex justify-between items-start mb-3">
											<div className="space-y-1">
												<div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
												<div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-900 rounded" />
											</div>
											<div className="h-5 w-16 bg-amber-100 dark:bg-amber-900/30 rounded-full" />
										</div>
										<div className="space-y-2">
											<div className="h-4 w-full bg-zinc-100 dark:bg-zinc-900 rounded" />
											<div className="h-4 w-2/3 bg-zinc-100 dark:bg-zinc-900 rounded" />
										</div>
									</div>
								))}
							</>
						)}
						{evalResults.map((evalRun) => {
							const config = getEvalConfig(evalRun.evalId);
							const result = evalRun.result;

							return (
								<div
									key={evalRun.id}
									className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
								>
									<div className="flex justify-between items-start mb-2">
										<div>
											<span className="text-zinc-900 dark:text-white font-medium">
												{config.name}
											</span>
											<span className="text-zinc-500 text-xs ml-2">({config.type})</span>
										</div>
										{evalRun.pending && (
											<span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs animate-pulse">
												Running
											</span>
										)}
										{!evalRun.success && !evalRun.pending && (
											<span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs">
												Failed
											</span>
										)}
										{result && !evalRun.pending && (
											<span
												className={`px-2 py-0.5 rounded-full text-xs ${
													result.passed
														? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
														: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
												}`}
											>
												{result.passed ? 'Passed' : 'Failed'}
											</span>
										)}
									</div>

									{config.type === 'score' && result?.score !== undefined && (
										<div className="mb-2">
											<div className="flex justify-between text-xs text-zinc-500 mb-1">
												<span>Score</span>
												<span>{(result.score * 100).toFixed(0)}%</span>
											</div>
											<div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
												<div
													className={`h-full transition-all duration-500 ${
														result.score >= 0.7
															? 'bg-green-500'
															: result.score >= 0.4
																? 'bg-amber-500'
																: 'bg-red-500'
													}`}
													style={{ width: `${result.score * 100}%` }}
												/>
											</div>
										</div>
									)}

									{result?.reason && (
										<p className="text-zinc-600 dark:text-zinc-400 text-sm">
											{result.reason}
										</p>
									)}
									{evalRun.error && (
										<p className="text-red-600 dark:text-red-400 text-sm">
											{evalRun.error}
										</p>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
