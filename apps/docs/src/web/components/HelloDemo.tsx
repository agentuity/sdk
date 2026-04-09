import { type ChangeEvent, useState, useCallback } from 'react';
import { usePersistentDemoState } from '../hooks/usePersistentDemoState';
import { Button, Input } from './ui';

export function HelloDemo() {
	const [name, setName] = usePersistentDemoState<string>('hello', 'name', {
		defaultValue: 'World',
		storage: 'session',
	});
	const [greeting, setGreeting] = usePersistentDemoState<string | null>('hello', 'greeting', {
		defaultValue: null,
		storage: 'session',
	});
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	// HelloDemo calls the /api/hello agent endpoint directly with a simple
	// POST and receives plain text back. useSandboxRunner is for pre-baked
	// sandbox scripts streamed over SSE — it is not the right fit here.
	const invoke = useCallback(
		async (input: { name: string }) => {
			setIsLoading(true);
			setError(null);
			try {
				const res = await fetch('/api/hello', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(input),
				});
				if (!res.ok) {
					throw new Error(`Request failed: ${res.status} ${res.statusText}`);
				}
				setGreeting(await res.text());
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error');
			} finally {
				setIsLoading(false);
			}
		},
		[setGreeting]
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg shadow-2xl flex flex-col gap-4 overflow-hidden p-4">
				<div className="flex gap-4 items-center">
					<label htmlFor="hello-name" className="sr-only">
						Your name
					</label>
					<Input
						id="hello-name"
						disabled={isLoading}
						onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
						placeholder="Enter your name"
						type="text"
						value={name}
						className="flex-1"
					/>

					<Button
						type="button"
						disabled={isLoading}
						onClick={async () => await invoke({ name })}
						variant="outline"
						size="default"
						className="whitespace-nowrap"
					>
						<span className="relative">
							<span className={isLoading ? 'invisible' : ''}>Say Hello</span>
							{isLoading && (
								<span
									className="absolute inset-0 flex items-center justify-center"
									data-loading="true"
								/>
							)}
						</span>
					</Button>
				</div>

				{error && (
					<div className="bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-900 rounded-md text-red-700 dark:text-red-300 text-sm px-4 py-3">
						Error: {error}
					</div>
				)}

				<div
					className={`bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md font-mono leading-relaxed px-4 py-3 ${
						greeting ? 'text-cyan-600 dark:text-cyan-400' : 'text-zinc-500 dark:text-zinc-400'
					}`}
				>
					{greeting ?? 'Waiting for request'}
				</div>
			</div>
		</div>
	);
}
