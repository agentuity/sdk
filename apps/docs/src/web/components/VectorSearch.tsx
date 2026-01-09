import { useCallback, useEffect, useState } from 'react';

interface SearchMatch {
	sku: string;
	name: string;
	price: number;
	rating: number;
	similarity: number;
}

interface SearchResult {
	matches: SearchMatch[];
	recommendation: string;
	recommendedSKU: string;
}

// Sample documents that come pre-seeded
const SAMPLE_DOCS = [{ name: 'products.json', description: 'Office furniture catalog' }] as const;

export function VectorSearch() {
	const [query, setQuery] = useState('');
	const [result, setResult] = useState<SearchResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [seeded, setSeeded] = useState(false);

	// Check if data exists on mount
	const checkStatus = useCallback(async () => {
		try {
			const response = await fetch('/api/vector-storage/status');
			const data = await response.json();
			if (data.success && data.hasData) {
				setSeeded(true);
			}
		} catch (err) {
			// Status check is non-critical - log but don't block UI
			console.warn('Vector status check failed:', err);
		}
	}, []);

	useEffect(() => {
		checkStatus();
	}, [checkStatus]);

	const seedData = async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch('/api/vector-storage/seed', { method: 'POST' });
			const data = await response.json();
			if (data.success) {
				setSeeded(true);
			} else {
				setError(data.error || 'Failed to seed data');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	const search = async () => {
		if (!query.trim()) return;

		setLoading(true);
		setError(null);
		try {
			// Auto-seed on first search if not already seeded
			if (!seeded) {
				const seedResponse = await fetch('/api/vector-storage/seed', { method: 'POST' });
				if (!seedResponse.ok) {
					throw new Error('Failed to auto-seed data');
				}
				setSeeded(true);
			}

			const response = await fetch('/api/vector-storage/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query }),
			});
			if (!response.ok) {
				throw new Error(`Search failed: HTTP ${response.status}`);
			}
			const data = await response.json();
			if (data.matches) {
				setResult(data);
			} else {
				setError(data.error || 'Search failed');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	const clearResults = () => {
		setResult(null);
		setQuery('');
		setError(null);
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Sample data controls */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<span className="text-zinc-500 text-xs uppercase">Document:</span>
						<div className="flex gap-2">
							{SAMPLE_DOCS.map((doc) => (
								<span
									key={doc.name}
									className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs px-3 py-1 rounded-full"
									title={doc.description}
								>
									{doc.name}
								</span>
							))}
						</div>
						{!seeded && (
							<button
								onClick={seedData}
								disabled={loading}
								type="button"
								className={`bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black rounded-md text-xs px-3 py-1.5 cursor-pointer ${
									loading ? 'opacity-50' : 'hover:bg-cyan-400 dark:hover:bg-cyan-300'
								}`}
							>
								{loading ? 'Loading...' : 'Load Sample Data'}
							</button>
						)}
						{seeded && (
							<span className="text-green-600 dark:text-green-400 text-xs">Loaded</span>
						)}
					</div>
					{result && (
						<button
							onClick={clearResults}
							type="button"
							className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-600 dark:text-zinc-400 text-xs px-3 py-2 cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600"
						>
							Clear Results
						</button>
					)}
				</div>
			</div>

			{/* Error display */}
			{error && (
				<div className="bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm p-4">
					{error}
				</div>
			)}

			{/* Search box */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-6">
				<div className="flex gap-2">
					<label htmlFor="vector-search" className="sr-only">
						Search products
					</label>
					<input
						id="vector-search"
						type="text"
						placeholder="Search for products... (e.g., 'comfortable office chair', 'budget option', 'gaming')"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && search()}
						className="flex-1 bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white text-sm px-4 py-3 outline-none focus:border-cyan-500 dark:focus:border-cyan-400"
					/>
					<button
						onClick={search}
						disabled={loading || !query.trim()}
						type="button"
						className={`rounded-md text-sm font-medium px-6 py-3 ${
							loading || !query.trim()
								? 'bg-zinc-200 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-600 cursor-not-allowed'
								: 'bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black cursor-pointer hover:bg-cyan-400 dark:hover:bg-cyan-300'
						}`}
					>
						{loading ? '...' : 'Search'}
					</button>
				</div>
			</div>

			{/* Loading state */}
			{loading && query.trim() && (
				<>
					{/* AI Recommendation skeleton */}
					<div className="bg-blue-100/50 dark:bg-blue-950/50 border border-blue-300 dark:border-blue-900 rounded-lg p-6 animate-pulse">
						<div className="h-4 w-32 bg-blue-200/50 dark:bg-blue-900/50 rounded mb-3" />
						<div className="space-y-2">
							<div className="h-4 w-full bg-blue-200/30 dark:bg-blue-900/30 rounded" />
							<div className="h-4 w-3/4 bg-blue-200/30 dark:bg-blue-900/30 rounded" />
						</div>
					</div>

					{/* Matches skeleton */}
					<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg">
						<div className="border-b border-zinc-200 dark:border-zinc-900 text-zinc-500 text-xs font-medium px-4 py-3 uppercase">
							Searching...
						</div>
						{[1, 2, 3].map((i) => (
							<div
								key={i}
								className="flex justify-between p-4 border-b border-zinc-200 dark:border-zinc-900 animate-pulse"
							>
								<div className="space-y-2">
									<div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
									<div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-900 rounded" />
								</div>
								<div className="text-right space-y-2">
									<div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded ml-auto" />
									<div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-900 rounded" />
								</div>
							</div>
						))}
					</div>
				</>
			)}

			{/* Results */}
			{!loading && result && (
				<>
					{/* AI Recommendation */}
					{result.recommendation && (
						<div className="bg-blue-100/50 dark:bg-blue-950/50 border border-blue-300 dark:border-blue-900 rounded-lg p-6">
							<h3 className="text-cyan-700 dark:text-cyan-400 text-sm font-medium m-0 mb-3">
								AI Recommendation
							</h3>
							<p className="text-zinc-700 dark:text-slate-200 text-[15px] leading-relaxed m-0">
								{result.recommendation}
							</p>
							{result.recommendedSKU && (
								<div className="mt-3 text-zinc-500 dark:text-slate-500 text-xs">
									Recommended: {result.recommendedSKU}
								</div>
							)}
						</div>
					)}

					{/* Matches */}
					<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg">
						<div className="border-b border-zinc-200 dark:border-zinc-900 text-zinc-500 text-xs font-medium px-4 py-3 uppercase">
							Matches ({result.matches.length})
						</div>
						{result.matches.length === 0 ? (
							<div className="text-zinc-500 dark:text-zinc-600 text-sm p-8 text-center">
								No matches found. Try a different search term.
							</div>
						) : (
							// Sort to put recommended item first
							result.matches
								.toSorted((a, b) => {
									if (a.sku === result.recommendedSKU) return -1;
									if (b.sku === result.recommendedSKU) return 1;
									return b.similarity - a.similarity;
								})
								.map((match) => (
									<div
										key={match.sku}
										className="flex justify-between p-4 border-b border-zinc-200 dark:border-zinc-900"
									>
										<div>
											<div
												className={`text-[15px] font-medium ${
													match.sku === result.recommendedSKU
														? 'text-cyan-700 dark:text-cyan-400'
														: 'text-zinc-900 dark:text-white'
												}`}
											>
												{match.name}
												{match.sku === result.recommendedSKU && (
													<span className="bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400 text-[10px] uppercase ml-2 px-1.5 py-0.5 rounded">
														Recommended
													</span>
												)}
											</div>
											<div className="text-zinc-500 text-xs mt-1">{match.sku}</div>
										</div>
										<div className="text-right">
											<div className="text-zinc-900 dark:text-white text-[15px]">
												${match.price}
											</div>
											<div className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">
												{match.rating} stars | {(match.similarity * 100).toFixed(0)}%
												match
											</div>
										</div>
									</div>
								))
						)}
					</div>
				</>
			)}
		</div>
	);
}
