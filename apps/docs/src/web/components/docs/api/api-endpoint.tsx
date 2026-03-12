'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';
import { useRegion } from './region-context';

interface ApiEndpointProps {
	method: string;
	path: string;
	host?: string;
}

const METHOD_STYLES: Record<string, string> = {
	GET: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
	POST: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
	PUT: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
	DELETE: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
	PATCH: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300',
};

export function ApiEndpoint({ method, path, host }: ApiEndpointProps) {
	const { baseUrl, region } = useRegion();
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const effectiveBaseUrl = host ? `https://${host}-${region}.agentuity.cloud` : baseUrl;
	const fullUrl = `${effectiveBaseUrl}${path}`;

	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[]
	);

	const onCopy = async () => {
		try {
			await navigator.clipboard.writeText(fullUrl);
			if (timerRef.current) clearTimeout(timerRef.current);
			setCopied(true);
			timerRef.current = setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard may not be available.
		}
	};

	return (
		<div className="my-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
			<div className="flex items-start justify-between gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<span
						className={cn(
							'inline-flex rounded-md px-2 py-1 font-mono text-xs font-bold tracking-wide',
							METHOD_STYLES[method.toUpperCase()] ??
								'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
						)}
					>
						{method.toUpperCase()}
					</span>
					<code className="break-all rounded bg-zinc-100 px-2 py-1 font-mono text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
						{path}
					</code>
				</div>
				<button
					type="button"
					onClick={onCopy}
					className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-zinc-300 bg-zinc-100 px-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
				>
					{copied ? (
						<Check className="size-3.5 text-green-500" />
					) : (
						<Copy className="size-3.5" />
					)}
					{copied ? 'Copied' : 'Copy URL'}
				</button>
			</div>

			<code className="mt-3 block break-all rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
				{fullUrl}
			</code>
		</div>
	);
}
