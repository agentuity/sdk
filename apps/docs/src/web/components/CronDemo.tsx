import { useEffect, useState } from "react";

interface LogEntry {
	time: string;
	message: string;
}

export function CronDemo() {
	const [isRunning, setIsRunning] = useState(false);
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [runCount, setRunCount] = useState(0);

	const formatTime = () => {
		return new Date().toLocaleTimeString();
	};

	const startSimulation = () => {
		if (isRunning) return;

		setIsRunning(true);
		setLogs([]);
		setRunCount(0);

		// Simulate 3 runs at 10-second intervals
		const runSimulation = (runNumber: number) => {
			if (runNumber > 3) {
				setIsRunning(false);
				return;
			}

			setRunCount(runNumber);
			setLogs((prev) => [
				...prev,
				{
					time: formatTime(),
					message: `Scheduled task executed (${runNumber}/3)`,
				},
			]);

			if (runNumber < 3) {
				setTimeout(() => runSimulation(runNumber + 1), 10000);
			} else {
				setIsRunning(false);
			}
		};

		// Start first run immediately
		runSimulation(1);
	};

	const reset = () => {
		setIsRunning(false);
		setLogs([]);
		setRunCount(0);
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Schedule display */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
				<div className="flex items-center justify-between flex-wrap gap-4">
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-3">
							<span className="text-zinc-500 text-xs uppercase">Schedule:</span>
							<code className="text-cyan-700 dark:text-cyan-400 text-sm">0 * * * *</code>
							<span className="text-zinc-500 dark:text-zinc-600 text-xs">(every hour)</span>
						</div>
						<span className="text-zinc-500 dark:text-zinc-600 text-xs">
							Simulated at 360x speed for demo
						</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={startSimulation}
							disabled={isRunning}
							type="button"
							className={`bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black rounded-md text-sm px-4 py-2 ${
								isRunning
									? "opacity-50 cursor-not-allowed"
									: "cursor-pointer hover:bg-cyan-400 dark:hover:bg-cyan-300"
							}`}
						>
							{isRunning
							? "Running..."
							: logs.length > 0
								? "Run Again"
								: "Start Simulation"}
						</button>
						{logs.length > 0 && !isRunning && (
							<button
								onClick={reset}
								type="button"
								className="bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md text-zinc-700 dark:text-zinc-300 text-sm px-4 py-2 cursor-pointer hover:bg-zinc-300 dark:hover:bg-zinc-700"
							>
								Reset
							</button>
						)}
					</div>
				</div>
			</div>

			{/* Countdown to next run */}
			{isRunning && runCount < 3 && (
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
					<CountdownTimer />
				</div>
			)}

			{/* Simulated terminal output */}
			{logs.length > 0 && (
				<div className="bg-[#0a1f0a] border border-green-900/50 rounded-lg p-3 font-mono text-xs">
					<div className="flex items-center gap-2 mb-2 pb-2 border-b border-green-900/30">
						<div className="flex gap-1.5">
							<div className="w-2 h-2 rounded-full bg-red-500/70" />
							<div className="w-2 h-2 rounded-full bg-yellow-500/70" />
							<div className="w-2 h-2 rounded-full bg-green-500/70" />
						</div>
						<span className="text-green-600 text-[10px]">
							Simulated Cron Output
						</span>
					</div>
					<div className="space-y-1">
						{logs.map((log, i) => (
							<div key={i} className="flex gap-2">
								<span className="text-green-600">[{log.time}]</span>
								<span className="text-green-300">{log.message}</span>
							</div>
						))}
						{isRunning && runCount < 3 && (
							<div className="flex gap-2 text-green-600 animate-pulse">
								<span>[...]</span>
								<span>Next run in 10 seconds...</span>
							</div>
						)}
						{!isRunning && logs.length === 3 && (
							<div className="flex gap-2 text-green-500 mt-2 pt-2 border-t border-green-900/30">
								<span>✓</span>
								<span>Simulation complete</span>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Empty state */}
			{logs.length === 0 && (
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-8">
					<p className="text-zinc-500 text-sm text-center">
						Click "Start Simulation" to see how cron jobs execute on a schedule.
					</p>
				</div>
			)}
		</div>
	);
}

// Countdown timer component
function CountdownTimer() {
	const [seconds, setSeconds] = useState(10);

	useEffect(() => {
		const interval = setInterval(() => {
			setSeconds((prev) => {
				if (prev <= 1) {
					return 10; // Reset for next cycle
				}
				return prev - 1;
			});
		}, 1000);

		return () => clearInterval(interval);
	}, []);

	return (
		<div className="flex items-center justify-center gap-3">
			<span className="text-zinc-500 text-sm">Next scheduled run in:</span>
			<span className="text-cyan-700 dark:text-cyan-400 text-2xl font-mono">{seconds}s</span>
		</div>
	);
}
