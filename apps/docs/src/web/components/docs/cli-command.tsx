'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CLICommandProps {
	command: string;
	children?: ReactNode;
	className?: string;
}

export function CLICommand({ command, children, className }: CLICommandProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(command);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div
			className={cn(
				'group relative my-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 overflow-hidden',
				className
			)}
		>
			<div className="p-4 font-mono text-sm">
				<div className="flex items-start gap-2">
					<span className="text-cyan-600 dark:text-cyan-400 select-none">$</span>
					<pre className="whitespace-pre-wrap">{command}</pre>
				</div>
				{children && (
					<div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap">
						{children}
					</div>
				)}
			</div>
			<button
				type="button"
				onClick={handleCopy}
				className={cn(
					'absolute top-3 right-3 p-1.5 rounded-md cursor-pointer',
					'opacity-0 group-hover:opacity-100 transition-opacity',
					'bg-zinc-200/80 dark:bg-zinc-700/80 hover:bg-zinc-300 dark:hover:bg-zinc-600',
					'text-zinc-600 dark:text-zinc-400'
				)}
				aria-label={copied ? 'Copied!' : 'Copy command'}
			>
				{copied ? (
					<Check className="size-4 text-green-600 dark:text-green-400" />
				) : (
					<Copy className="size-4" />
				)}
			</button>
		</div>
	);
}
