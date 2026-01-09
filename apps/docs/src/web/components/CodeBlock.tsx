import githubDarkModule from "@shikijs/themes/github-dark";
import githubLightModule from "@shikijs/themes/github-light";
import typescriptLang from "@shikijs/langs/typescript";
import { useEffect, useRef, useState } from "react";
import type { ThemeRegistration } from "shiki";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import { useTheme } from "./ThemeContext";

// Extract theme objects from default exports
const githubDark = (
	"default" in githubDarkModule ? githubDarkModule.default : githubDarkModule
) as ThemeRegistration;

const githubLight = (
	"default" in githubLightModule
		? githubLightModule.default
		: githubLightModule
) as ThemeRegistration;

// Initialize highlighter with both themes
let highlighterPromise: ReturnType<typeof createHighlighterCore> | null = null;

function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighterCore({
			themes: [githubDark, githubLight],
			langs: [typescriptLang],
			engine: createOnigurumaEngine(import("shiki/wasm")),
		});
	}
	return highlighterPromise;
}

async function highlightCode(
	code: string,
	theme: "light" | "dark"
): Promise<string> {
	const highlighter = await getHighlighter();
	const themeName =
		theme === "dark"
			? (githubDark.name ?? "github-dark")
			: (githubLight.name ?? "github-light");
	return highlighter.codeToHtml(code, {
		lang: "typescript",
		theme: themeName,
	});
}

interface CodeBlockProps {
	code: string;
	title?: string;
}

export function CodeBlock({ code, title }: CodeBlockProps) {
	const { resolvedTheme } = useTheme();
	const [copied, setCopied] = useState(false);
	const [html, setHtml] = useState<string>("");
	const mounted = useRef(false);

	useEffect(() => {
		mounted.current = true;
		highlightCode(code.trim(), resolvedTheme).then((highlighted) => {
			if (mounted.current) {
				setHtml(highlighted);
			}
		});

		return () => {
			mounted.current = false;
		};
	}, [code, resolvedTheme]);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(code.trim());
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="h-full flex flex-col bg-zinc-100 dark:bg-[#24292e] rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between px-4 h-12 border-b border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-900/50">
				<span className="text-sm text-zinc-500 dark:text-zinc-400">
					{title || "Example Code"}
				</span>
				<button
					type="button"
					onClick={handleCopy}
					className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
				>
					{copied ? (
						<>
							<svg
								aria-hidden="true"
								className="w-3.5 h-3.5 text-green-700 dark:text-green-400"
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
							<span className="text-green-700 dark:text-green-400">
								Copied!
							</span>
						</>
					) : (
						<>
							<svg
								aria-hidden="true"
								className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400"
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
							<span className="text-zinc-500 dark:text-zinc-400">Copy</span>
						</>
					)}
				</button>
			</div>

			{/* Code */}
			<div className="flex-1 overflow-auto">
				{html ? (
					<div
						className="[&>pre]:m-0 [&>pre]:p-4 [&>pre]:text-sm [&>pre]:leading-relaxed [&>pre]:min-w-fit [&_code]:font-mono [&_code]:text-sm"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is safe
						dangerouslySetInnerHTML={{ __html: html }}
					/>
				) : (
					<pre className="m-0 p-4 text-sm font-mono min-w-fit text-zinc-700 dark:text-zinc-300 leading-relaxed">
						<code>{code.trim()}</code>
					</pre>
				)}
			</div>
		</div>
	);
}
