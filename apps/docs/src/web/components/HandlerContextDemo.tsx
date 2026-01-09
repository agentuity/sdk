import { useEffect, useState } from "react";
import { JsonDisplay } from "./JsonDisplay";

// Mock terminal log entries
interface LogEntry {
	level: "trace" | "info" | "warn" | "error";
	message: string;
	delay?: number; // Delay in ms before showing this log
}

const endpoints = [
	{
		id: "session",
		label: "Session",
		description: "Session & thread IDs, state",
	},
	{
		id: "services",
		label: "Services",
		description: "Available storage & observability",
	},
	{ id: "agents", label: "Agents", description: "Agent registry info" },
	{
		id: "state",
		label: "State",
		description: "State management (call multiple times!)",
	},
	{
		id: "full",
		label: "Full Context",
		description: "Complete context dump from route",
	},
	{
		id: "logger",
		label: "Logger",
		description: "Log at different levels (check console)",
	},
	{
		id: "background",
		label: "Background",
		description: "waitUntil demo (5s delay in logs)",
	},
];

// Generate mock log entries based on endpoint
function generateMockLogs(endpoint: string): LogEntry[] {
	if (endpoint === "logger") {
		return [
			{ level: "trace", message: "Trace message from route" },
			{ level: "info", message: "Info message from route" },
			{ level: "warn", message: "Warning message from route" },
			{ level: "error", message: "Error message from route (demo only)" },
		];
	}

	if (endpoint === "background") {
		return [
			{ level: "info", message: "Background task started", delay: 0 },
			{ level: "info", message: "Response sent to client", delay: 100 },
			{ level: "info", message: "...waiting 5 seconds...", delay: 200 },
			{
				level: "info",
				message: "Background task completed after 5 seconds!",
				delay: 5000,
			},
		];
	}

	return [];
}

// Mock terminal component - shows logs progressively with delays
function MockTerminal({ logs }: { logs: LogEntry[] }) {
	const [visibleLogs, setVisibleLogs] = useState<LogEntry[]>([]);

	useEffect(() => {
		setVisibleLogs([]);
		const timeouts: ReturnType<typeof setTimeout>[] = [];

		for (const log of logs) {
			const timeout = setTimeout(() => {
				setVisibleLogs((prev) => [...prev, log]);
			}, log.delay ?? 0);
			timeouts.push(timeout);
		}

		return () => {
			for (const t of timeouts) clearTimeout(t);
		};
	}, [logs]);

	const getLevelColor = (level: LogEntry["level"]) => {
		switch (level) {
			case "trace":
				return "text-zinc-500";
			case "info":
				return "text-green-400";
			case "warn":
				return "text-yellow-400";
			case "error":
				return "text-red-400";
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
				<span className="text-green-600 text-[10px]">
					Example Terminal Output
				</span>
			</div>
			<div className="space-y-0.5">
				{visibleLogs.map((log) => (
					<div key={`${log.level}-${log.message}`} className="flex gap-2">
						<span className={`uppercase ${getLevelColor(log.level)}`}>
							[{log.level}]
						</span>
						<span className="text-green-300">{log.message}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function HandlerContextDemo() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [data, setData] = useState<unknown>(null);
	const [lastEndpoint, setLastEndpoint] = useState<string | null>(null);
	const [mockLogs, setMockLogs] = useState<LogEntry[]>([]);

	const callEndpoint = async (endpoint: string) => {
		setLoading(true);
		setError(null);
		setLastEndpoint(endpoint);
		setMockLogs([]);

		try {
			const response = await fetch(`/api/context/${endpoint}`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			const json = await response.json();
			setData(json);

			// Generate mock logs for logger/background endpoints
			if (endpoint === "logger" || endpoint === "background") {
				setMockLogs(generateMockLogs(endpoint));
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setData(null);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-6">
				<div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
					{endpoints.map((ep) => (
						<button
							key={ep.id}
							onClick={() => callEndpoint(ep.id)}
							disabled={loading}
							title={ep.description}
							type="button"
							className={`rounded-md text-sm text-center py-2.5 px-4 transition-all ${
								lastEndpoint === ep.id
									? "bg-blue-100 dark:bg-blue-900/50 border border-blue-400 dark:border-blue-500 text-blue-700 dark:text-white"
									: "bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white"
							} ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600"}`}
						>
							{ep.label}
						</button>
					))}
				</div>
			</div>

			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-6">
				<h3 className="text-zinc-600 dark:text-zinc-400 text-sm font-normal m-0 mb-4">
					Response{" "}
					{lastEndpoint && (
						<span className="text-cyan-700 dark:text-cyan-400">/{lastEndpoint}</span>
					)}
				</h3>
				<JsonDisplay data={data} loading={loading} error={error} />

				{/* Mock Terminal - shows what the server terminal would display */}
				{mockLogs.length > 0 && <MockTerminal logs={mockLogs} />}
			</div>

		</div>
	);
}
