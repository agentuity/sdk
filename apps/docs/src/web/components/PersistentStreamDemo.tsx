import { useCallback, useEffect, useRef, useState } from 'react';

interface StreamInfo {
	id: string;
	name: string;
	url: string;
	sizeBytes: number;
	metadata: Record<string, string>;
}

export function PersistentStreamDemo() {
	const [streams, setStreams] = useState<StreamInfo[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const fetchStreams = useCallback(async () => {
		try {
			const response = await fetch('/api/durable-stream/list');
			const result = await response.json();
			if (!result.error) {
				setStreams(result.streams || []);
			}
			return result.streams || [];
		} catch {
			return [];
		}
	}, []);

	// Load streams on mount
	useEffect(() => {
		fetchStreams();
		return () => {
			if (pollRef.current) clearInterval(pollRef.current);
		};
	}, [fetchStreams]);

	const handleCreate = async () => {
		setIsGenerating(true);
		setError(null);

		try {
			const response = await fetch('/api/durable-stream/create', {
				method: 'POST',
			});
			const result = await response.json();

			if (result.error) {
				setError(result.error);
				setIsGenerating(false);
				return;
			}

			const newStreamId = result.streamId;

			// Poll until stream has content
			if (pollRef.current) clearInterval(pollRef.current);
			pollRef.current = setInterval(async () => {
				const currentStreams = await fetchStreams();
				const newStream = currentStreams.find((s: StreamInfo) => s.id === newStreamId);

				if (newStream && newStream.sizeBytes > 0) {
					if (pollRef.current) clearInterval(pollRef.current);
					setIsGenerating(false);
				}
			}, 2000);

			// Timeout after 60 seconds
			setTimeout(() => {
				if (pollRef.current) {
					clearInterval(pollRef.current);
					setIsGenerating(false);
					fetchStreams(); // Final fetch to show whatever we have
				}
			}, 60000);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create stream');
			setIsGenerating(false);
		}
	};

	const formatBytes = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		return `${(bytes / 1024).toFixed(1)} KB`;
	};

	const formatTitle = (startTime?: string) => {
		if (!startTime) return 'AI Summary';
		const date = new Date(startTime);
		return `Summary - ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
	};

	// Only show streams with content
	const readyStreams = streams.filter((s) => s.sizeBytes > 0);

	return (
		<div className="flex flex-col gap-4">
			{/* Error display */}
			{error && (
				<div className="bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm p-4">
					{error}
				</div>
			)}

			{/* Streams list */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg">
				<div className="border-b border-zinc-200 dark:border-zinc-900 px-4 py-3 flex items-center justify-between">
					<span className="text-zinc-500 text-xs font-medium uppercase">
						History ({readyStreams.length})
					</span>
					<button
						onClick={handleCreate}
						disabled={isGenerating}
						type="button"
						className={`rounded-md text-sm px-4 py-2 flex items-center gap-2 ${
							isGenerating
								? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 cursor-not-allowed'
								: 'bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black cursor-pointer hover:bg-cyan-400 dark:hover:bg-cyan-300'
						}`}
					>
						{isGenerating && (
							<span className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
						)}
						{isGenerating ? 'Generating...' : 'Generate Summary'}
					</button>
				</div>
				{readyStreams.length > 0 ? (
					<div className="divide-y divide-zinc-200 dark:divide-zinc-900">
						{readyStreams.map((stream) => (
							<a
								key={stream.id}
								href={stream.url}
								target="_blank"
								rel="noopener noreferrer"
								className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-900/50 transition-colors block no-underline"
							>
								<div className="flex flex-col gap-1 flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-zinc-900 dark:text-white text-sm">
											{formatTitle(stream.metadata?.startTime)}
										</span>
										<span className="text-zinc-500 dark:text-zinc-600 text-xs">
											{formatBytes(stream.sizeBytes)}
										</span>
									</div>
									{stream.metadata?.startTime && (
										<span className="text-zinc-500 text-xs">
											{new Date(stream.metadata.startTime).toLocaleDateString()}
										</span>
									)}
								</div>
								<span className="text-zinc-500 dark:text-zinc-600 text-xs">↗</span>
							</a>
						))}
					</div>
				) : (
					<div className="px-4 py-8 text-zinc-500 text-sm text-center">
						No summaries yet. Click "Generate Summary" to create one.
					</div>
				)}
			</div>
		</div>
	);
}
