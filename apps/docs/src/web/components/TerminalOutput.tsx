import { useEffect, useRef, useState, useMemo } from 'react';

export type TerminalStatus = 'idle' | 'creating' | 'recreating' | 'running' | 'completed' | 'error';

interface TerminalOutputProps {
	output: string;
	status: TerminalStatus;
	error?: string | null;
	exitCode?: number | null;
	onClear?: () => void;
}

// Strip timestamp prefix from sandbox output lines (e.g., "2026-01-16T17:46:32.005264730Z ")
function cleanOutput(output: string): string {
	return output.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm, '');
}

const CREATING_MESSAGES = [
	'Creating sandbox',
	'Provisioning resources',
	'Starting runtime',
];

export function TerminalOutput({ output, status, error, exitCode, onClear }: TerminalOutputProps) {
	const outputRef = useRef<HTMLDivElement>(null);
	const [creatingMessageIndex, setCreatingMessageIndex] = useState(0);
	const cleanedOutput = useMemo(() => (output ? cleanOutput(output) : ''), [output]);

	// Cycle through creating messages
	useEffect(() => {
		if (status !== 'creating') {
			setCreatingMessageIndex(0);
			return;
		}

		const interval = setInterval(() => {
			setCreatingMessageIndex((prev) =>
				prev < CREATING_MESSAGES.length - 1 ? prev + 1 : prev
			);
		}, 3000);

		return () => clearInterval(interval);
	}, [status]);

	// Auto-scroll to bottom when output changes
	useEffect(() => {
		if (outputRef.current) {
			outputRef.current.scrollTop = outputRef.current.scrollHeight;
		}
	}, [output]);

	const getStatusConfig = (status: TerminalStatus, exitCode: number | null | undefined): { dot: string; text: string } => {
		if (status === 'completed') {
			if (exitCode !== null && exitCode !== undefined && exitCode !== 0) {
				return { dot: 'bg-red-500', text: 'Failed' };
			}
			return { dot: 'bg-green-500', text: 'Completed' };
		}
		const statusConfig: Record<TerminalStatus, { dot: string; text: string }> = {
			idle: { dot: 'bg-zinc-500', text: 'Ready' },
			creating: { dot: 'bg-yellow-500 animate-pulse', text: 'Creating sandbox' },
			recreating: { dot: 'bg-yellow-500 animate-pulse', text: 'Recreating sandbox' },
			running: { dot: 'bg-cyan-500 animate-pulse', text: 'Executing' },
			completed: { dot: 'bg-green-500', text: 'Completed' },
			error: { dot: 'bg-red-500', text: 'Error' },
		};
		return statusConfig[status];
	};

	const { dot, text } = getStatusConfig(status, exitCode);

	return (
		<div className="flex flex-col bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden flex-shrink-0">
			{/* Header */}
			<div className="flex items-center justify-between px-4 h-10 border-b border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50">
				<div className="flex items-center gap-2">
					<div className={`w-2 h-2 rounded-full ${dot}`} />
					<span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
						{text}
					</span>
					{status === 'completed' && exitCode !== null && exitCode !== undefined && (
						<span
							className={`text-xs ${exitCode === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
						>
							(exit {exitCode})
						</span>
					)}
				</div>
				{(output || error) && onClear && (
					<button
						type="button"
						onClick={onClear}
						className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
					>
						Clear
					</button>
				)}
			</div>

			{/* Output */}
			<div
				ref={outputRef}
				className="p-4 text-sm font-mono text-zinc-700 dark:text-zinc-300 overflow-auto h-[180px] whitespace-pre-wrap"
			>
				{status === 'idle' && !output && !error && (
					<span className="text-zinc-400 dark:text-zinc-600">Output will appear here...</span>
				)}
				{status === 'creating' && !output && (
					<span data-loading="true" className="text-yellow-600 dark:text-yellow-400">
						{CREATING_MESSAGES[creatingMessageIndex] ?? 'Creating sandbox'}
					</span>
				)}
				{status === 'running' && !output && (
					<span data-loading="true" className="text-cyan-600 dark:text-cyan-400">
						Executing agent
					</span>
				)}
				{cleanedOutput && <span>{cleanedOutput}</span>}
				{error && <span className="text-red-600 dark:text-red-400">{error}</span>}
			</div>
		</div>
	);
}
