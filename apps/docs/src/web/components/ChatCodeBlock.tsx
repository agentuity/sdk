import { useEffect, useRef, useState } from 'react';
import { useTheme } from './ThemeContext';
import githubDarkModule from '@shikijs/themes/github-dark';
import githubLightModule from '@shikijs/themes/github-light';
import typescriptLang from '@shikijs/langs/typescript';
import javascriptLang from '@shikijs/langs/javascript';
import bashLang from '@shikijs/langs/bash';
import jsonLang from '@shikijs/langs/json';
import type { ThemeRegistration } from 'shiki';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

const githubDark = (
	'default' in githubDarkModule ? githubDarkModule.default : githubDarkModule
) as ThemeRegistration;

const githubLight = (
	'default' in githubLightModule ? githubLightModule.default : githubLightModule
) as ThemeRegistration;

// Shared highlighter with multiple languages
let highlighterPromise: ReturnType<typeof createHighlighterCore> | null = null;

function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighterCore({
			themes: [githubDark, githubLight],
			langs: [typescriptLang, javascriptLang, bashLang, jsonLang],
			engine: createOnigurumaEngine(import('shiki/wasm')),
		});
	}
	return highlighterPromise;
}

// Map common language aliases
function normalizeLanguage(lang: string): string {
	const aliases: Record<string, string> = {
		ts: 'typescript',
		js: 'javascript',
		sh: 'bash',
		shell: 'bash',
		zsh: 'bash',
	};
	return aliases[lang.toLowerCase()] || lang.toLowerCase();
}

async function highlightCode(code: string, lang: string, theme: 'light' | 'dark'): Promise<string> {
	const highlighter = await getHighlighter();
	const themeName =
		theme === 'dark' ? (githubDark.name ?? 'github-dark') : (githubLight.name ?? 'github-light');

	const normalizedLang = normalizeLanguage(lang);
	const supportedLangs = ['typescript', 'javascript', 'bash', 'json'];

	return highlighter.codeToHtml(code, {
		lang: supportedLangs.includes(normalizedLang) ? normalizedLang : 'typescript',
		theme: themeName,
	});
}

interface ChatCodeBlockProps {
	code: string;
	language?: string;
}

export function ChatCodeBlock({ code, language = 'typescript' }: ChatCodeBlockProps) {
	const { resolvedTheme } = useTheme();
	const [copied, setCopied] = useState(false);
	const [html, setHtml] = useState<string>('');
	const [isHovered, setIsHovered] = useState(false);
	const mounted = useRef(false);

	useEffect(() => {
		mounted.current = true;
		highlightCode(code.trim(), language, resolvedTheme).then((highlighted) => {
			if (mounted.current) {
				setHtml(highlighted);
			}
		});

		return () => {
			mounted.current = false;
		};
	}, [code, language, resolvedTheme]);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(code.trim());
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div
			className="relative my-2 rounded-md overflow-hidden bg-zinc-100 dark:bg-[#24292e] border border-zinc-300 dark:border-zinc-700"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Copy button (appears on hover) */}
			<button
				type="button"
				onClick={handleCopy}
				className={`absolute top-1.5 right-1.5 p-1 rounded transition-opacity ${
					isHovered || copied ? 'opacity-100' : 'opacity-0'
				} hover:bg-zinc-200 dark:hover:bg-zinc-700`}
			>
				{copied ? (
					<svg
						aria-hidden="true"
						className="w-3.5 h-3.5 text-green-600 dark:text-green-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M5 13l4 4L19 7"
						/>
					</svg>
				) : (
					<svg
						aria-hidden="true"
						className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
						/>
					</svg>
				)}
			</button>

			{/* Code */}
			<div className="overflow-x-auto">
				{html ? (
					<div
						className="[&>pre]:m-0 [&>pre]:px-3 [&>pre]:py-2.5 [&>pre]:text-xs [&>pre]:leading-relaxed [&_code]:font-mono [&_code]:text-xs"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is safe
						dangerouslySetInnerHTML={{ __html: html }}
					/>
				) : (
					<pre className="m-0 px-3 py-2.5 text-xs font-mono text-zinc-700 dark:text-zinc-300 leading-relaxed">
						<code>{code.trim()}</code>
					</pre>
				)}
			</div>
		</div>
	);
}
