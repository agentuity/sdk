import { useEffect, useRef, useState, useMemo } from 'react';
import { Button, Separator, StatusIndicator } from './ui/index.ts';

export type TerminalStatus = 'idle' | 'creating' | 'recreating' | 'running' | 'completed' | 'error';

interface TerminalOutputProps {
	output: string;
	status: TerminalStatus;
	error?: string | null;
	exitCode?: number | null;
	onClear?: () => void;
	isRoute?: boolean;
}

// Strip timestamp prefix from sandbox output lines (e.g., "2026-01-16T17:46:32.005264730Z ")
function cleanOutput(output: string): string {
	return output.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm, '');
}

const CREATING_MESSAGES = ['Creating sandbox', 'Provisioning resources', 'Starting runtime'];

export function TerminalOutput({
	output,
	status,
	error,
	exitCode,
	onClear,
	isRoute,
}: TerminalOutputProps) {
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
			setCreatingMessageIndex((prev) => (prev < CREATING_MESSAGES.length - 1 ? prev + 1 : prev));
		}, 3000);

		return () => clearInterval(interval);
	}, [status]);

	// Auto-scroll to bottom when output changes
	useEffect(() => {
		if (outputRef.current) {
			outputRef.current.scrollTop = outputRef.current.scrollHeight;
		}
	}, [output]);

	const getStatusIndicatorConfig = (
		status: TerminalStatus,
		exitCode: number | null | undefined
	): { indicatorStatus: 'idle' | 'pending' | 'running' | 'success' | 'error'; text: string } => {
		if (status === 'completed') {
			if (exitCode !== null && exitCode !== undefined && exitCode !== 0) {
				return { indicatorStatus: 'error', text: 'Failed' };
			}
			return { indicatorStatus: 'success', text: 'Completed' };
		}
		const statusConfig: Record<
			TerminalStatus,
			{ indicatorStatus: 'idle' | 'pending' | 'running' | 'success' | 'error'; text: string }
		> = {
			idle: { indicatorStatus: 'idle', text: 'Ready' },
			creating: { indicatorStatus: 'pending', text: 'Creating sandbox' },
			recreating: { indicatorStatus: 'pending', text: 'Recreating sandbox' },
			running: { indicatorStatus: 'running', text: 'Executing' },
			completed: { indicatorStatus: 'success', text: 'Completed' },
			error: { indicatorStatus: 'error', text: 'Error' },
		};
		return statusConfig[status];
	};

	const { indicatorStatus, text } = getStatusIndicatorConfig(status, exitCode);

	return (
		<div className="flex flex-col bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden flex-shrink-0">
			{/* Header */}
			<div className="flex items-center justify-between px-4 h-10 bg-zinc-200/50 dark:bg-zinc-800/50">
				<div className="flex items-center gap-2">
					<StatusIndicator status={indicatorStatus} label={text} showLabel={false} />
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
					<Button variant="ghost" size="xs" onClick={onClear}>
						Clear
					</Button>
				)}
			</div>
			<Separator className="bg-zinc-300 dark:bg-zinc-700" />

			{/* Output */}
			<div
				ref={outputRef}
				className="p-4 text-sm font-mono text-zinc-700 dark:text-zinc-300 overflow-auto h-[180px] whitespace-pre-wrap"
			>
				{status === 'idle' && !output && !error && (
					<span className="text-zinc-400 dark:text-zinc-600">Output will appear here...</span>
				)}
				{(status === 'creating' || status === 'recreating') && !output && (
					<span data-loading="true" className="text-yellow-600 dark:text-yellow-400">
						{CREATING_MESSAGES[creatingMessageIndex] ?? 'Creating sandbox'}
					</span>
				)}
				{status === 'running' && !output && (
					<span data-loading="true" className="text-cyan-600 dark:text-cyan-400">
						Executing {isRoute ? 'route' : 'agent'}
					</span>
				)}
				{cleanedOutput && <span>{cleanedOutput}</span>}
				{error && <span className="text-red-600 dark:text-red-400">{error}</span>}
			</div>
		</div>
	);
}
