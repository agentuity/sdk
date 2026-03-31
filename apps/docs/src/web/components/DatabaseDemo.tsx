import { BarChart3, CheckCircle, Database, DollarSign, Search, Star } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { Badge, Button, Separator } from './ui';

type QueryId = 'all' | 'budget' | 'top-rated' | 'keyword' | 'summary';

const QUERIES: { id: QueryId; label: string; icon: ReactNode; description: string }[] = [
	{
		id: 'all',
		label: 'All Products',
		icon: <Database className="size-3.5" />,
		description: 'SELECT * FROM products',
	},
	{
		id: 'budget',
		label: 'Budget (< $200)',
		icon: <DollarSign className="size-3.5" />,
		description: 'WHERE price < 200',
	},
	{
		id: 'top-rated',
		label: 'Top Rated (4.5+)',
		icon: <Star className="size-3.5" />,
		description: 'WHERE avg_rating >= 4.5',
	},
	{
		id: 'keyword',
		label: 'Search "Ergo"',
		icon: <Search className="size-3.5" />,
		description: 'WHERE name ILIKE %Ergo%',
	},
	{
		id: 'summary',
		label: 'Price Summary',
		icon: <BarChart3 className="size-3.5" />,
		description: 'AVG, MIN, MAX, COUNT',
	},
];

interface ProductRow {
	id: number;
	sku: string;
	name: string;
	price: number;
	avg_rating: number;
	description: string;
	customer_feedback: string;
}

interface SummaryRow {
	avgPrice: string;
	minPrice: number;
	maxPrice: number;
	total: number;
}

interface QueryResult {
	rows: ProductRow[] | SummaryRow[];
	query: string;
	count: number;
}

export function DatabaseDemo() {
	const [selectedQuery, setSelectedQuery] = useState<QueryId>('all');
	const [hasRun, setHasRun] = useState(false);
	const [seeded, setSeeded] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [result, setResult] = useState<QueryResult | null>(null);

	const invoke = useCallback(async (input: { query: QueryId; seedData?: boolean }) => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/database', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				throw new Error(`Request failed: ${res.status} ${res.statusText}`);
			}
			setResult(await res.json());
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Unknown error'));
		} finally {
			setIsLoading(false);
		}
	}, []);

	const reset = useCallback(() => {
		setResult(null);
		setError(null);
	}, []);

	const handleRun = () => {
		setHasRun(true);
		invoke({ query: selectedQuery });
	};

	const handleSeed = () => {
		setHasRun(true);
		setSeeded(true);
		invoke({ query: selectedQuery, seedData: true });
	};

	const handleQueryChange = (id: QueryId) => {
		setSelectedQuery(id);
		if (hasRun) {
			setHasRun(false);
			reset();
		}
	};

	const typedResult = result as QueryResult | undefined;
	const isSummaryQuery = typedResult?.query === 'summary';

	return (
		<div className="flex flex-col gap-4">
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				{/* Left Panel - Controls */}
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
					<div className="flex flex-col gap-4">
						{!seeded ? (
							/* First-run state: seed prompt */
							<div className="flex flex-col gap-3">
								<p className="text-zinc-500 dark:text-zinc-400 text-sm">
									Seed the database with 6 sample chair products, then run queries.
								</p>
								<Button
									onClick={handleSeed}
									disabled={isLoading}
									variant="outline"
									size="default"
									className="self-start"
								>
									<span className="relative">
										<span className={isLoading ? 'invisible' : ''}>Seed &amp; Run</span>
										{isLoading && (
											<span
												className="absolute inset-0 flex items-center justify-center"
												data-loading="true"
											/>
										)}
									</span>
								</Button>
							</div>
						) : (
							/* Seeded state: query selector + run */
							<>
								{/* Query Selector */}
								<div>
									<div className="flex items-center gap-2 mb-2">
										<span className="text-zinc-500 dark:text-zinc-400 block text-xs uppercase">
											Query
										</span>
										<Badge variant="success" className="gap-1">
											<CheckCircle className="size-3" />6 products loaded
										</Badge>
									</div>
									<div className="flex flex-wrap gap-2">
										{QUERIES.map((q) => (
											<Button
												key={q.id}
												onClick={() => handleQueryChange(q.id)}
												disabled={isLoading}
												variant={selectedQuery === q.id ? 'toggle-active' : 'toggle'}
												size="xs"
											>
												{q.icon}
												<span>{q.label}</span>
											</Button>
										))}
									</div>
								</div>

								{/* SQL Preview */}
								<div>
									<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-1 uppercase">
										SQL
									</span>
									<code className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
										{QUERIES.find((q) => q.id === selectedQuery)?.description}
									</code>
								</div>

								{/* Action Buttons */}
								<div className="flex items-center gap-2">
									<Button
										onClick={handleRun}
										disabled={isLoading}
										variant="outline"
										size="default"
										className="self-start"
									>
										<span className="relative">
											<span className={isLoading ? 'invisible' : ''}>Run Query</span>
											{isLoading && (
												<span
													className="absolute inset-0 flex items-center justify-center"
													data-loading="true"
												/>
											)}
										</span>
									</Button>
									<Button
										onClick={handleSeed}
										disabled={isLoading}
										variant="ghost"
										size="sm"
										className="text-zinc-500"
									>
										Re-seed
									</Button>
								</div>
							</>
						)}
					</div>
				</div>

				{/* Right Panel - Results */}
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden">
					<div className="px-4 py-3 flex justify-between items-center">
						<span className="text-zinc-900 dark:text-white font-medium text-sm">
							Query Results
						</span>
						{hasRun && typedResult && !isLoading && (
							<Badge variant="secondary" className="text-[10px]">
								{typedResult.count} {typedResult.count === 1 ? 'row' : 'rows'}
							</Badge>
						)}
					</div>
					<Separator />

					{/* Before running */}
					{!hasRun && (
						<div className="p-8 text-center">
							<p className="text-zinc-500 dark:text-zinc-500 text-sm">
								Select a query and run it to see results.
							</p>
						</div>
					)}

					{/* Loading state */}
					{hasRun && isLoading && (
						<div className="p-8 flex items-center justify-center">
							<span data-loading="true" className="size-6" />
						</div>
					)}

					{/* Error state */}
					{hasRun && error && !isLoading && (
						<div className="p-4 space-y-2">
							<p className="text-red-600 dark:text-red-400 text-sm">
								{error instanceof Error ? error.message : 'Failed to run query'}
							</p>
							<p className="text-zinc-500 dark:text-zinc-500 text-xs">
								This demo requires a DATABASE_URL environment variable. It works when the
								Explorer is deployed to Agentuity Cloud.
							</p>
						</div>
					)}

					{/* Result state - Summary */}
					{hasRun && typedResult && !isLoading && isSummaryQuery && (
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-zinc-200 dark:border-zinc-900">
										<th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase px-4 py-2">
											Avg Price
										</th>
										<th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase px-4 py-2">
											Min Price
										</th>
										<th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase px-4 py-2">
											Max Price
										</th>
										<th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase px-4 py-2">
											Total
										</th>
									</tr>
								</thead>
								<tbody>
									{(typedResult.rows as SummaryRow[]).map((row, i) => (
										<tr key={i} className="border-b border-zinc-200 dark:border-zinc-900">
											<td className="text-xs font-mono text-zinc-900 dark:text-white px-4 py-2.5">
												${Number(row.avgPrice).toFixed(2)}
											</td>
											<td className="text-xs font-mono text-zinc-900 dark:text-white px-4 py-2.5">
												${row.minPrice}
											</td>
											<td className="text-xs font-mono text-zinc-900 dark:text-white px-4 py-2.5">
												${row.maxPrice}
											</td>
											<td className="text-xs font-mono text-zinc-900 dark:text-white px-4 py-2.5">
												{row.total}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}

					{/* Result state - Product rows */}
					{hasRun && typedResult && !isLoading && !isSummaryQuery && (
						<div className="overflow-x-auto">
							{typedResult.rows.length === 0 ? (
								<div className="text-zinc-500 dark:text-zinc-600 text-sm p-8 text-center">
									No rows returned.
								</div>
							) : (
								<table className="w-full">
									<thead>
										<tr className="border-b border-zinc-200 dark:border-zinc-900">
											<th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase px-4 py-2">
												SKU
											</th>
											<th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase px-4 py-2">
												Name
											</th>
											<th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase px-4 py-2">
												Price
											</th>
											<th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase px-4 py-2">
												Rating
											</th>
										</tr>
									</thead>
									<tbody>
										{(typedResult.rows as ProductRow[]).map((row) => (
											<tr
												key={row.sku}
												className="border-b border-zinc-200 dark:border-zinc-900"
											>
												<td className="text-xs font-mono text-zinc-500 dark:text-zinc-400 px-4 py-2.5">
													{row.sku}
												</td>
												<td className="text-xs font-mono text-zinc-900 dark:text-white px-4 py-2.5">
													{row.name}
												</td>
												<td className="text-xs font-mono text-zinc-900 dark:text-white px-4 py-2.5">
													${row.price}
												</td>
												<td className="text-xs font-mono text-zinc-900 dark:text-white px-4 py-2.5">
													{row.avg_rating}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Callout Tip */}
			<div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-4 py-3">
				<p className="text-zinc-600 dark:text-zinc-400 text-xs">
					<span className="text-cyan-600 dark:text-cyan-400 font-medium">Tip:</span> The{' '}
					<a
						href="/demo/vector-storage"
						className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-500"
					>
						vector demo
					</a>{' '}
					found these same chairs by meaning. This demo finds them by exact criteria — same
					data, different query model.
				</p>
			</div>
		</div>
	);
}
