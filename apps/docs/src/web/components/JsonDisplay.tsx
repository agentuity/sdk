import type { ReactNode } from 'react';

interface JsonDisplayProps {
	data: unknown;
	loading?: boolean;
	error?: string | null;
	placeholder?: string;
}

export function JsonDisplay({
	data,
	loading = false,
	error = null,
	placeholder = 'Waiting for request',
}: JsonDisplayProps) {
	let content: ReactNode;
	let colorClass: string;

	if (loading) {
		content = <span data-loading="true">Loading</span>;
		colorClass = 'text-zinc-500 dark:text-zinc-400';
	} else if (error) {
		content = `Error: ${error}`;
		colorClass = 'text-red-500 dark:text-red-400';
	} else if (data !== null && data !== undefined) {
		content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
		colorClass = 'text-cyan-700 dark:text-cyan-400';
	} else {
		content = placeholder;
		colorClass = 'text-zinc-500 dark:text-zinc-400';
	}

	return (
		<pre
			className={`bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md font-mono text-sm
                  leading-relaxed m-0 max-h-[400px] overflow-auto px-4 py-3
                  whitespace-pre-wrap break-words ${colorClass}`}
		>
			{content}
		</pre>
	);
}
