import { useEffect, useState } from 'react';

// Fixed sample text for Agent Calls demo
const SAMPLE_TEXT = 'Hello!!!   from the ***SDK Explorer***...  #demo @test';

// Mock terminal log entry
interface LogEntry {
	level: 'info' | 'debug';
	message: string;
	delay: number;
}

// Mock terminal component - shows logs progressively with delays
function MockTerminal({ logs, taskId }: { logs: LogEntry[]; taskId: string }) {
	const [visibleLogs, setVisibleLogs] = useState<LogEntry[]>([]);

	useEffect(() => {
		setVisibleLogs([]);
		const timeouts: ReturnType<typeof setTimeout>[] = [];

		for (const log of logs) {
			const timeout = setTimeout(() => {
				setVisibleLogs((prev) => [...prev, log]);
			}, log.delay);
			timeouts.push(timeout);
		}

		return () => {
			for (const t of timeouts) clearTimeout(t);
		};
	}, [logs]);

	const getLevelColor = (level: LogEntry['level']) => {
		switch (level) {
			case 'info':
				return 'text-green-400';
			case 'debug':
				return 'text-zinc-500';
		}
	};

	return (
		<div className="bg-[#0a1f0a] border border-green-900/50 rounded-lg p-3 font-mono text-xs mt-4">
			<div className="flex items-center gap-2 mb-2 pb-2 border-b border-green-900/30">
				<div className="flex gap-1.5">
					<div className="w-2 h-2 rounded-full bg-red-500/70" />
					<div className="w-2 h-2 rounded-full bg-yellow-500/70" />
					<div className="w-2 h-2 rounded-full bg-green-500/70" />
				</div>
				<span className="text-green-600 text-[10px]">Example Terminal Output</span>
			</div>
			<div className="space-y-0.5">
				{visibleLogs.map((log) => (
					<div key={`${log.level}-${log.message}`} className="flex gap-2">
						<span className={`uppercase ${getLevelColor(log.level)}`}>[{log.level}]</span>
						<span className="text-green-300">{log.message}</span>
					</div>
				))}
				{visibleLogs.length < logs.length && (
					<div className="flex gap-2 animate-pulse">
						<span className="text-zinc-600">[...]</span>
						<span className="text-zinc-600">waiting...</span>
					</div>
				)}
			</div>
		</div>
	);
}

type Pattern = 'sync' | 'background' | 'chain';

interface SyncResult {
	pattern: string;
	description: string;
	duration: string;
	result: {
		original: string;
		operation: string;
		result: string;
		processedAt: string;
	};
}

interface BackgroundResult {
	pattern: string;
	description: string;
	taskId: string;
	note: string;
}

interface ChainResult {
	pattern: string;
	description: string;
	duration: string;
	original: string;
	steps: { step: number; operation: string; result: string }[];
	final: string;
}

type Result = SyncResult | BackgroundResult | ChainResult;

// Generate mock logs for background task
function generateBackgroundLogs(taskId: string, operation: string): LogEntry[] {
	return [
		{
			level: 'info',
			message: `Background task queued {taskId: "${taskId}"}`,
			delay: 0,
		},
		{
			level: 'info',
			message: 'Response sent to client immediately',
			delay: 100,
		},
		{
			level: 'debug',
			message: `Starting ${operation} operation in background...`,
			delay: 500,
		},
		{
			level: 'info',
			message: `Background task completed {taskId: "${taskId}"}`,
			delay: 3000,
		},
	];
}

async function fetchAPI<T>(url: string, body?: object): Promise<T> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return response.json();
}

export function AgentCallsDemo() {
	const [pattern, setPattern] = useState<Pattern>('sync');
	const [operation, setOperation] = useState('clean');
	const [result, setResult] = useState<Result | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [backgroundLogs, setBackgroundLogs] = useState<LogEntry[]>([]);

	const handleRun = async () => {
		setIsLoading(true);
		setResult(null);
		setBackgroundLogs([]);

		try {
			let res: Result;
			switch (pattern) {
				case 'sync':
					res = await fetchAPI<SyncResult>('/api/agent-calls/sync', { operation });
					break;
				case 'background':
					res = await fetchAPI<BackgroundResult>('/api/agent-calls/background', { operation });
					if ('taskId' in res) {
						setBackgroundLogs(generateBackgroundLogs(res.taskId, operation));
					}
					break;
				case 'chain':
					res = await fetchAPI<ChainResult>('/api/agent-calls/chain');
					break;
			}
			setResult(res);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-8">
			{/* Main interaction panel */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg shadow-2xl flex flex-col gap-6 overflow-hidden p-8">
				{/* Hint text */}
				<p className="text-zinc-500 text-sm m-0">
					Select a pattern and operation, then click Run to see agent invocation in action.
				</p>

				{/* Pattern selector */}
				<div className="flex flex-col gap-2">
					<span className="text-zinc-500 text-sm">Call Pattern</span>
					<div className="flex gap-2">
						{(
							[
								{ id: 'sync', label: 'Direct' },
								{ id: 'background', label: 'Background' },
								{ id: 'chain', label: 'Chain' },
							] as const
						).map((p) => (
							<button
								key={p.id}
								type="button"
								disabled={isLoading}
								onClick={() => setPattern(p.id)}
								className={`px-4 py-2 rounded-md text-sm border transition-colors ${
									pattern === p.id
										? 'bg-cyan-100 dark:bg-cyan-900/30 border-cyan-500 dark:border-cyan-700 text-cyan-700 dark:text-cyan-400'
										: 'bg-zinc-100 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600'
								} ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
							>
								{p.label}
							</button>
						))}
					</div>
				</div>

				{/* Operation selector (only for sync/background) */}
				{pattern !== 'chain' && (
					<div className="flex flex-col gap-2">
						<span className="text-zinc-500 text-sm">Operation</span>
						<div className="flex gap-2">
							{(['clean', 'analyze'] as const).map((op) => (
								<button
									key={op}
									type="button"
									disabled={isLoading}
									onClick={() => setOperation(op)}
									className={`px-3 py-1.5 rounded text-xs border transition-colors ${
										operation === op
											? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500 dark:border-blue-700 text-blue-700 dark:text-blue-400'
											: 'bg-zinc-100 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-600'
									} ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
								>
									{op}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Sample Text + Run */}
				<div className="flex flex-col gap-2">
					<span className="text-zinc-500 text-sm">Sample Text</span>
					<div className="flex gap-4">
						<div className="flex-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 text-sm px-4 py-3 font-mono truncate">
							{SAMPLE_TEXT}
						</div>
						<button
							disabled={isLoading}
							onClick={handleRun}
							type="button"
							className={`bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black rounded-md text-sm px-6 py-3 whitespace-nowrap ${
								isLoading
									? 'opacity-50 cursor-not-allowed'
									: 'cursor-pointer hover:bg-cyan-400 dark:hover:bg-cyan-300'
							}`}
						>
							<span data-loading={isLoading ? 'true' : undefined}>
								{isLoading ? 'Running' : 'Run'}
							</span>
						</button>
					</div>
				</div>

				{/* Result display */}
				{result && (
					<div className="flex flex-col gap-4">
						<div className="bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md p-4">
							{/* Direct (sync) result */}
							{'result' in result && 'original' in result.result && (
								<div className="text-cyan-700 dark:text-cyan-400 font-mono">
									{result.result.result}
								</div>
							)}

							{/* Background result */}
							{'taskId' in result && (
								<div className="space-y-2">
									<div className="text-zinc-700 dark:text-zinc-300">
										Response returned immediately, agent runs in background
									</div>
									<div className="text-zinc-500 text-sm">
										Task ID:{' '}
										<code className="text-cyan-700 dark:text-cyan-400">
											{result.taskId}
										</code>
									</div>
								</div>
							)}

							{/* Chain result */}
							{'steps' in result && (
								<div className="space-y-2">
									{result.steps.map((step) => (
										<div key={step.step} className="flex items-center gap-2 text-sm">
											<span className="text-zinc-500 w-28 shrink-0">
												Agent {step.step} ({step.operation}):
											</span>
											<span className="text-cyan-700 dark:text-cyan-400 font-mono">
												{step.result}
											</span>
										</div>
									))}
								</div>
							)}
						</div>

						{/* Mock terminal for background tasks */}
						{'taskId' in result && backgroundLogs.length > 0 && (
							<MockTerminal logs={backgroundLogs} taskId={result.taskId} />
						)}
					</div>
				)}
			</div>
		</div>
	);
}
