'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';
import { useTheme } from '../../ThemeContext';
import { useRegion } from './region-context';
import githubDarkModule from '@shikijs/themes/github-dark';
import githubLightModule from '@shikijs/themes/github-light';
import typescriptLang from '@shikijs/langs/typescript';
import bashLang from '@shikijs/langs/bash';
import type { ThemeRegistration } from 'shiki';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

const githubDark = (
	'default' in githubDarkModule ? githubDarkModule.default : githubDarkModule
) as ThemeRegistration;

const githubLight = (
	'default' in githubLightModule ? githubLightModule.default : githubLightModule
) as ThemeRegistration;

let highlighterPromise: ReturnType<typeof createHighlighterCore> | null = null;

function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighterCore({
			themes: [githubDark, githubLight],
			langs: [typescriptLang, bashLang],
			engine: createOnigurumaEngine(import('shiki/wasm')),
		});
	}
	return highlighterPromise;
}

async function highlightCode(code: string, lang: string, theme: 'light' | 'dark'): Promise<string> {
	const highlighter = await getHighlighter();
	const themeName =
		theme === 'dark' ? (githubDark.name ?? 'github-dark') : (githubLight.name ?? 'github-light');
	return highlighter.codeToHtml(code, {
		lang,
		theme: themeName,
	});
}

interface ApiExampleProps {
	method: string;
	path: string;
	body?: string | object;
	headers?: Record<string, string>;
	description?: string;
	host?: string;
}

type ExampleTab = 'curl' | 'typescript';

function stringifyBody(body: string | object): string {
	if (typeof body === 'string') return body;
	return JSON.stringify(body, null, 2);
}

function escapeSingleQuotes(value: string): string {
	return value.replaceAll("'", "'\\''");
}

function buildCurlExample(
	method: string,
	url: string,
	headers: Record<string, string>,
	body?: string | object
): string {
	const lines = [`curl -X ${method.toUpperCase()} '${url}'`];

	for (const [key, value] of Object.entries(headers)) {
		lines.push(`  -H '${key}: ${value}'`);
	}

	if (body !== undefined) {
		lines.push(`  -d '${escapeSingleQuotes(stringifyBody(body))}'`);
	}

	return lines.join(' \\\n');
}

function buildSdkExample(
	method: string,
	baseUrl: string,
	path: string,
	body?: string | object
): string {
	const m = method.toUpperCase();
	const bodyStr = body !== undefined ? stringifyBody(body) : undefined;
	const indent = '  ';

	const lines = [
		`import { APIClient, createLogger } from '@agentuity/core';`,
		'',
		`const client = new APIClient('${baseUrl}', createLogger('info'), process.env.AGENTUITY_SDK_KEY);`,
		'',
	];

	if (m === 'GET') {
		lines.push(`const result = await client.get('${path}');`);
		lines.push('console.log(result);');
	} else if (m === 'DELETE') {
		lines.push(`await client.delete('${path}');`);
	} else if (m === 'PUT') {
		if (bodyStr) {
			lines.push(`await client.put('${path}', ${bodyStr.replaceAll('\n', `\n${indent}`)});`);
		} else {
			lines.push(`await client.put('${path}');`);
		}
	} else if (m === 'POST') {
		if (bodyStr) {
			lines.push(`await client.post('${path}', ${bodyStr.replaceAll('\n', `\n${indent}`)});`);
		} else {
			lines.push(`await client.post('${path}');`);
		}
	} else if (m === 'PATCH') {
		if (bodyStr) {
			lines.push(`await client.patch('${path}', ${bodyStr.replaceAll('\n', `\n${indent}`)});`);
		} else {
			lines.push(`await client.patch('${path}');`);
		}
	}

	return lines.join('\n');
}

export function ApiExample({ method, path, body, headers, description, host }: ApiExampleProps) {
	const { baseUrl, region } = useRegion();
	const { resolvedTheme } = useTheme();
	const [tab, setTab] = useState<ExampleTab>('curl');
	const [copiedTab, setCopiedTab] = useState<ExampleTab | null>(null);
	const [highlightedHtml, setHighlightedHtml] = useState<string>('');
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const requestIdRef = useRef(0);

	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[]
	);

	const effectiveBaseUrl = host ? `https://${host}-${region}.agentuity.cloud` : baseUrl;
	const fullUrl = `${effectiveBaseUrl}${path}`;

	const mergedHeaders = useMemo(() => {
		const next: Record<string, string> = {
			Authorization: 'Bearer $AGENTUITY_SDK_KEY',
			...(headers ?? {}),
		};

		if (
			body !== undefined &&
			!Object.keys(next).some((key) => key.toLowerCase() === 'content-type')
		) {
			next['Content-Type'] = 'application/json';
		}

		return next;
	}, [body, headers]);

	const curlCode = buildCurlExample(method, fullUrl, mergedHeaders, body);

	const sdkCode = buildSdkExample(method, effectiveBaseUrl, path, body);

	const activeCode = tab === 'curl' ? curlCode : sdkCode;

	useEffect(() => {
		const currentRequestId = ++requestIdRef.current;
		setHighlightedHtml('');
		const lang = tab === 'curl' ? 'bash' : 'typescript';
		highlightCode(activeCode, lang, resolvedTheme).then((html) => {
			if (currentRequestId === requestIdRef.current) {
				setHighlightedHtml(html);
			}
		});
	}, [activeCode, tab, resolvedTheme]);

	const copyCode = async () => {
		try {
			await navigator.clipboard.writeText(activeCode);
			if (timerRef.current) clearTimeout(timerRef.current);
			setCopiedTab(tab);
			timerRef.current = setTimeout(() => setCopiedTab(null), 2000);
		} catch {
			// Clipboard may be unavailable.
		}
	};

	return (
		<div className="my-4 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
			{description && (
				<p className="px-4 pt-4 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
			)}

			<div className="flex items-center justify-between border-b border-zinc-200 px-2 py-2 dark:border-zinc-800">
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setTab('curl')}
						className={cn(
							'rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors',
							tab === 'curl'
								? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
								: 'text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800'
						)}
					>
						curl
					</button>
					<button
						type="button"
						onClick={() => setTab('typescript')}
						className={cn(
							'rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors',
							tab === 'typescript'
								? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
								: 'text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800'
						)}
					>
						TypeScript
					</button>
				</div>

				<button
					type="button"
					onClick={copyCode}
					className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-100 px-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
				>
					{copiedTab === tab ? (
						<Check className="size-3.5 text-green-500" />
					) : (
						<Copy className="size-3.5" />
					)}
					{copiedTab === tab ? 'Copied' : 'Copy'}
				</button>
			</div>

			{highlightedHtml ? (
				<div
					className="overflow-x-auto [&>pre]:m-0 [&>pre]:p-4 [&>pre]:text-sm [&>pre]:bg-transparent [&_code]:font-mono"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is safe
					dangerouslySetInnerHTML={{ __html: highlightedHtml }}
				/>
			) : (
				<pre className="overflow-x-auto p-4 text-sm">
					<code className="font-mono text-zinc-900 dark:text-zinc-100">{activeCode}</code>
				</pre>
			)}
		</div>
	);
}
