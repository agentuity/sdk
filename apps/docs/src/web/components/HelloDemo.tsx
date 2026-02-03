import { useAPI } from '@agentuity/react';
import { type ChangeEvent, useState } from 'react';
import { Button, Input } from './ui';

export function HelloDemo() {
	const [name, setName] = useState('World');
	const { invoke, isLoading, data: greeting } = useAPI('POST /api/hello');

	return (
		<div className="flex flex-col gap-8">
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg shadow-2xl flex flex-col gap-6 overflow-hidden p-8">
				<div className="flex gap-4 items-center">
					<label htmlFor="hello-name" className="sr-only">Your name</label>
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
						onClick={() => invoke({ name })}
						variant="outline"
						size="default"
						className="whitespace-nowrap"
					>
						<span data-loading={isLoading ? 'true' : undefined}>
							{isLoading ? 'Running' : 'Say Hello'}
						</span>
					</Button>
				</div>

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
