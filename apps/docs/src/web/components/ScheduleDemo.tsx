import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';

interface LogEntry {
	time: string;
	message: string;
}

interface ScheduleInfo {
	id: string;
	name: string;
	expression: string;
	destinationCount: number;
}

export function ScheduleDemo() {
	const [scheduleId, setScheduleId] = useState<string | null>(null);
	const [scheduleInfo, setScheduleInfo] = useState<ScheduleInfo | null>(null);
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [step, setStep] = useState(0);

	// Track schedule ID in a ref for cleanup on unmount
	const scheduleIdRef = useRef<string | null>(null);
	useEffect(() => {
		scheduleIdRef.current = scheduleId;
	}, [scheduleId]);

	// Clean up schedule if user navigates away without deleting
	useEffect(() => {
		return () => {
			const id = scheduleIdRef.current;
			if (id) {
				fetch(`/api/schedule/${id}`, { method: 'DELETE' }).catch(() => {});
			}
		};
	}, []);

	const formatTime = () => new Date().toLocaleTimeString();

	const appendLog = (message: string) => {
		setLogs((prev) => [...prev, { time: formatTime(), message }]);
	};

	const handleCreate = async () => {
		setLoading(true);
		setError(null);
		try {
			const name = `demo-${Date.now()}`;
			const resp = await fetch('/api/schedule/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, expression: '0 * * * *' }),
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const result = await resp.json();
			if (!result.success) throw new Error(result.message || 'Failed to create schedule');

			const { schedule } = result.data;
			setScheduleId(schedule.id);
			setScheduleInfo({
				id: schedule.id,
				name: schedule.name,
				expression: schedule.expression ?? '0 * * * *',
				destinationCount: 0,
			});
			appendLog(`Schedule created: ${schedule.name} (${schedule.id})`);
			setStep(1);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create schedule');
		} finally {
			setLoading(false);
		}
	};

	const handleAddDestination = async () => {
		if (!scheduleId) return;
		setLoading(true);
		setError(null);
		try {
			const resp = await fetch('/api/schedule/destination', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					scheduleId,
					type: 'url',
					config: { url: 'https://api.example.com/trigger' },
				}),
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const result = await resp.json();
			if (!result.success) throw new Error(result.message || 'Failed to add destination');

			const { destination } = result.data;
			setScheduleInfo((prev) =>
				prev ? { ...prev, destinationCount: prev.destinationCount + 1 } : prev
			);
			appendLog(`Destination added: https://api.example.com/trigger (${destination.id})`);
			setStep(2);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add destination');
		} finally {
			setLoading(false);
		}
	};

	const handleList = async () => {
		setLoading(true);
		setError(null);
		try {
			const resp = await fetch('/api/schedule/list');
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const result = await resp.json();
			if (!result.success) throw new Error(result.message || 'Failed to list schedules');

			const { total } = result.data;
			appendLog(`Found ${total} schedule${total !== 1 ? 's' : ''} in your project`);
			setStep(3);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to list schedules');
		} finally {
			setLoading(false);
		}
	};

	const handleDelete = async () => {
		if (!scheduleId) return;
		setLoading(true);
		setError(null);
		try {
			const resp = await fetch(`/api/schedule/${scheduleId}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const result = await resp.json();
			if (!result.success) throw new Error(result.message || 'Failed to delete schedule');

			appendLog(`Schedule ${scheduleId} deleted`);
			scheduleIdRef.current = null; // Clear ref immediately to prevent double-DELETE on unmount
			setStep(4); // Prevent double-click during reset delay

			// Reset state after a brief pause so the log line is visible
			setTimeout(() => {
				setScheduleId(null);
				setScheduleInfo(null);
				setLogs([]);
				setStep(0);
				setLoading(false);
			}, 1200);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete schedule');
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Schedule info card */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
				{scheduleInfo ? (
					<div className="flex items-center justify-between flex-wrap gap-4">
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-3">
								<span className="text-zinc-500 text-xs uppercase">Name:</span>
								<code className="text-zinc-900 dark:text-white text-sm font-mono">
									{scheduleInfo.name}
								</code>
							</div>
							<div className="flex items-center gap-3">
								<span className="text-zinc-500 text-xs uppercase">Schedule:</span>
								<code className="text-cyan-600 dark:text-cyan-400 text-sm">
									{scheduleInfo.expression}
								</code>
								<span className="text-zinc-500 dark:text-zinc-600 text-xs">
									(every hour)
								</span>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-zinc-500 text-xs uppercase">Destinations:</span>
							<span className="inline-flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs font-mono px-2 py-0.5 min-w-[1.5rem]">
								{scheduleInfo.destinationCount}
							</span>
						</div>
					</div>
				) : (
					<div className="flex items-center gap-3">
						<span className="text-zinc-500 text-xs uppercase">Schedule:</span>
						<code className="text-cyan-600 dark:text-cyan-400 text-sm">0 * * * *</code>
						<span className="text-zinc-500 dark:text-zinc-600 text-xs">(every hour)</span>
					</div>
				)}
			</div>

			{/* Error display */}
			{error && (
				<div className="bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm p-3">
					{error}
				</div>
			)}

			{/* Action buttons */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						onClick={handleCreate}
						disabled={loading || step !== 0}
						variant="outline"
						size="sm"
					>
						<span className="relative">
							<span className={loading && step === 0 ? 'invisible' : ''}>
								Create Schedule
							</span>
							{loading && step === 0 && (
								<span
									className="absolute inset-0 flex items-center justify-center"
									data-loading="true"
								/>
							)}
						</span>
					</Button>

					<Button
						onClick={handleAddDestination}
						disabled={loading || step !== 1}
						variant="outline"
						size="sm"
					>
						<span className="relative">
							<span className={loading && step === 1 ? 'invisible' : ''}>
								Add Destination
							</span>
							{loading && step === 1 && (
								<span
									className="absolute inset-0 flex items-center justify-center"
									data-loading="true"
								/>
							)}
						</span>
					</Button>

					<Button
						onClick={handleList}
						disabled={loading || step !== 2}
						variant="outline"
						size="sm"
					>
						<span className="relative">
							<span className={loading && step === 2 ? 'invisible' : ''}>
								List Schedules
							</span>
							{loading && step === 2 && (
								<span
									className="absolute inset-0 flex items-center justify-center"
									data-loading="true"
								/>
							)}
						</span>
					</Button>

					<Button
						onClick={handleDelete}
						disabled={loading || step !== 3}
						variant="ghost"
						size="sm"
					>
						<span className="relative">
							<span className={loading && step === 3 ? 'invisible' : ''}>Delete</span>
							{loading && step === 3 && (
								<span
									className="absolute inset-0 flex items-center justify-center"
									data-loading="true"
								/>
							)}
						</span>
					</Button>
				</div>

				{/* Step guidance */}
				{step > 0 && step < 4 && (
					<p className="text-zinc-500 dark:text-zinc-600 text-xs mt-3">
						{step === 1 && 'Schedule created. Next: add a URL destination.'}
						{step === 2 && 'Destination added. Next: list all schedules in the project.'}
						{step === 3 && 'Done. Click Delete to clean up.'}
					</p>
				)}
			</div>

			{/* Terminal output */}
			{logs.length > 0 ? (
				<div className="bg-[#0a1f0a] border border-green-900/50 rounded-lg p-3 font-mono text-xs">
					<div className="flex items-center gap-2 mb-2 pb-2 border-b border-green-900/30">
						<div className="flex gap-1.5">
							<span className="h-2 w-2 rounded-full bg-red-500/70" />
							<span className="h-2 w-2 rounded-full bg-yellow-500/70" />
							<span className="h-2 w-2 rounded-full bg-green-500/70" />
						</div>
						<span className="text-green-600 text-[10px]">Schedule Output</span>
					</div>
					<div className="space-y-1">
						{logs.map((log, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: logs are append-only and have no stable id
								key={i}
								className="flex gap-2"
							>
								<span className="text-green-600">[{log.time}]</span>
								<span className="text-green-300">{log.message}</span>
							</div>
						))}
						{loading && (
							<div className="flex gap-2 text-green-600 animate-pulse">
								<span>[...]</span>
								<span>Working...</span>
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-8">
					<p className="text-zinc-500 text-sm text-center">
						Click "Create Schedule" to get started.
					</p>
				</div>
			)}
		</div>
	);
}
