'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';
import { useRegion } from './region-context';

export function RegionPicker({ className, host }: { className?: string; host?: string }) {
	const { region, setRegion, baseUrl, regions } = useRegion();
	const displayUrl = host ? `https://${host}-${region}.agentuity.cloud` : baseUrl;
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[]
	);

	const copyBaseUrl = async () => {
		try {
			await navigator.clipboard.writeText(displayUrl);
			if (timerRef.current) clearTimeout(timerRef.current);
			setCopied(true);
			timerRef.current = setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard may not be available.
		}
	};

	return (
		<div
			className={cn(
				'my-6 rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50',
				className
			)}
		>
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="flex flex-col gap-2 md:flex-row md:items-center">
					<label
						htmlFor="api-region"
						className="text-xs font-medium tracking-wide text-zinc-600 uppercase dark:text-zinc-400"
					>
						Region
					</label>
					<select
						id="api-region"
						value={region}
						onChange={(event) => setRegion(event.target.value as 'usw' | 'usc' | 'use')}
						className="h-9 min-w-48 appearance-none rounded-md border border-zinc-300 bg-white py-0 pr-8 pl-3 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
						style={{
							backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
							backgroundRepeat: 'no-repeat',
							backgroundPosition: 'right 0.5rem center',
							backgroundSize: '1rem',
						}}
					>
						{regions.map((option) => (
							<option key={option.code} value={option.code}>
								{option.code} · {option.name}
							</option>
						))}
					</select>
				</div>

				<div className="flex items-center gap-2">
					<code className="max-w-[28rem] truncate rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
						{displayUrl}
					</code>
					<button
						type="button"
						onClick={copyBaseUrl}
						className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-100 px-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
					>
						{copied ? (
							<Check className="size-3.5 text-green-500" />
						) : (
							<Copy className="size-3.5" />
						)}
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
			</div>
		</div>
	);
}
