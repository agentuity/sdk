import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useState } from "react";
import { useTheme } from "./ThemeContext";

// Line highlight configuration
export interface LineHighlight {
	lines: number | [number, number]; // Single line or [start, end] range
	className?: "important" | "subtle"; // Style variant
}

interface CodeBlockProps {
	code: string;
	title?: string;
	showRunButton?: boolean;
	onRun?: () => void;
	isRunning?: boolean;
	highlights?: LineHighlight[];
}

export function CodeBlock({ code, title, showRunButton, onRun, isRunning, highlights }: CodeBlockProps) {
	const { resolvedTheme } = useTheme();
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(code.trim());
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	// Apply line decorations when editor mounts
	const handleEditorMount: OnMount = useCallback(
		(editor, monaco) => {
			if (!highlights?.length) return;

			const decorations = highlights.map((h) => {
				const [startLine, endLine] =
					typeof h.lines === "number" ? [h.lines, h.lines] : h.lines;
				const styleClass =
					h.className === "subtle"
						? "line-highlight-subtle"
						: "line-highlight-important";

				return {
					range: new monaco.Range(startLine, 1, endLine, 1),
					options: {
						isWholeLine: true,
						className: styleClass,
					},
				};
			});

			editor.createDecorationsCollection(decorations);
		},
		[highlights]
	);

	return (
		<div className="flex flex-col bg-zinc-100 dark:bg-[#1e1e1e] rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden h-[420px]">
			{/* Header */}
			<div className="flex items-center justify-between px-4 h-12 border-b border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-900/50 flex-shrink-0">
				<span className="text-sm text-zinc-500 dark:text-zinc-400">
					{title || "Reference Code"}
				</span>
				<div className="flex items-center gap-2">
					{showRunButton && (
						<button
							type="button"
							onClick={onRun}
							disabled={isRunning}
							className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors ${
								isRunning
									? "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
									: "bg-cyan-500 dark:bg-cyan-500 text-black hover:bg-cyan-400 dark:hover:bg-cyan-400 cursor-pointer"
							}`}
						>
							{isRunning ? (
								<>
									<svg
										aria-hidden="true"
										className="w-3.5 h-3.5 animate-spin"
										fill="none"
										viewBox="0 0 24 24"
									>
										<circle
											className="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
										/>
										<path
											className="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										/>
									</svg>
									<span>Running</span>
								</>
							) : (
								<>
									<svg
										aria-hidden="true"
										className="w-3.5 h-3.5"
										fill="currentColor"
										viewBox="0 0 24 24"
									>
										<path d="M8 5v14l11-7z" />
									</svg>
									<span>Run</span>
								</>
							)}
						</button>
					)}
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
			</div>

			{/* Monaco Editor */}
			<div className="flex-1 min-h-0 pl-2">
				<Editor
					value={code.trim()}
					language="typescript"
					theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
					onMount={handleEditorMount}
					options={{
						readOnly: true,
						minimap: { enabled: false },
						scrollBeyondLastLine: false,
						fontSize: 13,
						lineNumbers: "on",
						lineNumbersMinChars: 3,
						glyphMargin: false,
						folding: true,
						renderLineHighlight: "line",
						overviewRulerLanes: 0,
						hideCursorInOverviewRuler: true,
						overviewRulerBorder: false,
						scrollbar: {
							vertical: "auto",
							horizontal: "auto",
							verticalScrollbarSize: 8,
							horizontalScrollbarSize: 8,
						},
						padding: { top: 12, bottom: 12 },
						domReadOnly: true,
						contextmenu: false,
					}}
				/>
			</div>
		</div>
	);
}
