import { useCallback, useEffect, useState } from 'react';

export function KVExplorer() {
	const [keys, setKeys] = useState<string[]>([]);
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const [selectedValue, setSelectedValue] = useState<unknown>(null);
	const [loading, setLoading] = useState(false);
	const [seeding, setSeeding] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [seeded, setSeeded] = useState(false);

	const fetchKeys = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch('/api/key-value/keys');
			const data = await response.json();
			if (data.success) {
				const keysList = data.keys || [];
				setKeys(keysList);
				// Data is seeded if any keys exist
				if (keysList.length > 0) {
					setSeeded(true);
				}
			} else {
				setError('Failed to fetch keys');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchKeys();
	}, [fetchKeys]);

	const fetchValue = async (key: string) => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch(`/api/key-value/get/${encodeURIComponent(key)}`);
			const data = await response.json();
			if (data.success) {
				setSelectedKey(key);
				setSelectedValue(data.value);
			} else {
				setError(data.error || 'Failed to fetch value');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	const seedData = async () => {
		setLoading(true);
		setSeeding(true);
		setError(null);
		try {
			const response = await fetch('/api/key-value/seed', {
				method: 'POST',
			});

			const data = await response.json();
			if (data.success) {
				setSeeded(true);
				await fetchKeys();
			} else {
				// If already seeded, still mark as seeded
				if (data.message?.includes('already')) {
					setSeeded(true);
					await fetchKeys();
				} else {
					setError(data.message || 'Failed to seed data');
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to seed data');
		} finally {
			setLoading(false);
			setSeeding(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Sample data controls */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
				<div className="flex items-center gap-3">
					<span className="text-zinc-500 text-xs uppercase">Sample Data:</span>
					{!seeded && (
						<button
							onClick={seedData}
							disabled={loading}
							type="button"
							className={`bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black rounded-md text-xs px-3 py-1.5 cursor-pointer ${
								loading ? 'opacity-50' : 'hover:bg-cyan-400 dark:hover:bg-cyan-300'
							}`}
						>
							<span data-loading={seeding ? 'true' : undefined}>
								{seeding ? 'Loading' : 'Load Sample Data'}
							</span>
						</button>
					)}
					{seeded && (
						<span className="text-green-600 dark:text-green-400 text-xs">Loaded</span>
					)}
				</div>
			</div>

			{/* Error display */}
			{error && (
				<div className="bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm p-4">
					{error}
				</div>
			)}

			{/* Main content - two columns */}
			<div className="grid grid-cols-2 gap-4">
				{/* Left column: Key list */}
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg flex flex-col max-h-[400px]">
					<div className="border-b border-zinc-200 dark:border-zinc-900 text-zinc-500 text-xs font-medium px-4 py-3 uppercase">
						Keys ({keys.length})
					</div>
					<div className="flex-1 overflow-y-auto">
						{keys.length === 0 ? (
							<div className="text-zinc-500 dark:text-zinc-600 text-sm p-8 text-center">
								No keys found. Click "Load Sample Data" to add a sample.
							</div>
						) : (
							keys.map((key) => (
								<button
									key={key}
									type="button"
									onClick={() => fetchValue(key)}
									className={`flex items-center w-full text-left text-sm px-4 py-3 truncate bg-transparent border-none border-b border-zinc-200 dark:border-zinc-900 cursor-pointer ${
										selectedKey === key
											? 'bg-zinc-100 dark:bg-zinc-900 text-cyan-700 dark:text-cyan-400'
											: 'text-zinc-900 dark:text-white'
									}`}
								>
									{key}
								</button>
							))
						)}
					</div>
				</div>

				{/* Right column: Value viewer */}
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg flex flex-col max-h-[400px]">
					<div className="border-b border-zinc-200 dark:border-zinc-900 text-zinc-500 text-xs font-medium px-4 py-3 uppercase">
						Value
					</div>
					<div className="flex-1 overflow-y-auto p-4">
						{selectedKey ? (
							<div>
								<div className="text-cyan-700 dark:text-cyan-400 text-xs mb-2">
									{selectedKey}
								</div>
								<pre className="bg-zinc-100 dark:bg-zinc-950 rounded-md text-zinc-600 dark:text-zinc-400 text-[13px] m-0 overflow-auto p-3 whitespace-pre-wrap break-words">
									{typeof selectedValue === 'string'
										? selectedValue
										: JSON.stringify(selectedValue, null, 2)}
								</pre>
							</div>
						) : (
							<div className="text-zinc-500 dark:text-zinc-600 text-sm text-center">
								Select a key to view its value
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
