import { useAPI } from '@agentuity/react';
import { type ChangeEvent, useState } from 'react';

export function HelloDemo() {
	const [name, setName] = useState('World');
	const { invoke, isLoading, data: greeting } = useAPI('POST /api/hello');

	return (
		<div className="flex flex-col gap-8">
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg shadow-2xl flex flex-col gap-6 overflow-hidden p-8">
				<div className="flex gap-4">
					<input
						disabled={isLoading}
						onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
						placeholder="Enter your name"
						type="text"
						value={name}
						className="bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white flex-1 outline-none px-4 py-3 focus:border-cyan-500 dark:focus:border-cyan-400"
					/>

					<button
						disabled={isLoading}
						onClick={() => invoke({ name })}
						type="button"
						className={`bg-gradient-to-r from-cyan-600 to-blue-500 dark:from-cyan-800 dark:to-blue-500 border-none rounded-md text-white px-6 py-3 whitespace-nowrap ${
							isLoading
								? 'opacity-50 cursor-not-allowed'
								: 'cursor-pointer hover:from-cyan-500 hover:to-blue-400 dark:hover:from-cyan-700 dark:hover:to-blue-400'
						}`}
					>
						{isLoading ? 'Running...' : 'Say Hello'}
					</button>
				</div>

				<div
					className={`bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md font-mono leading-relaxed px-4 py-3 ${
						greeting ? 'text-cyan-700 dark:text-cyan-400' : 'text-zinc-500 dark:text-zinc-400'
					}`}
				>
					{greeting ?? 'Waiting for request'}
				</div>
			</div>
		</div>
	);
}
