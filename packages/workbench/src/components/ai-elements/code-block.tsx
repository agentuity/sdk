"use client";

import javascriptLang from "@shikijs/langs/javascript";
import jsonLang from "@shikijs/langs/json";
import typescriptLang from "@shikijs/langs/typescript";
import themeDarkModule from "@shikijs/themes/dark-plus";
import themeLightModule from "@shikijs/themes/light-plus";
import type { Element } from "hast";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
	type ComponentProps,
	createContext,
	type HTMLAttributes,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import type { ShikiTransformer, ThemeRegistration } from "shiki";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

// Extract theme objects from default exports
const themeLight = (
	"default" in themeLightModule ? themeLightModule.default : themeLightModule
) as ThemeRegistration;
const themeDark = (
	"default" in themeDarkModule ? themeDarkModule.default : themeDarkModule
) as ThemeRegistration;

type SupportedLanguage = "json" | "javascript" | "typescript";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
	code: string;
	language: SupportedLanguage;
	showLineNumbers?: boolean;
};

type CodeBlockContextType = {
	code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({
	code: "",
});

// Initialize highlighter with only the languages and themes we need
let highlighterPromise: ReturnType<typeof createHighlighterCore> | null = null;

function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighterCore({
			themes: [themeLight, themeDark],
			langs: [jsonLang, javascriptLang, typescriptLang],
			engine: createOnigurumaEngine(import("shiki/wasm")),
		});
	}
	return highlighterPromise;
}

const lineNumberTransformer: ShikiTransformer = {
	name: "line-numbers",
	line(node: Element, line: number) {
		node.children.unshift({
			type: "element",
			tagName: "span",
			properties: {
				className: [
					"inline-block",
					"min-w-10",
					"mr-4",
					"text-right",
					"select-none",
					"text-muted-foreground",
				],
			},
			children: [{ type: "text", value: String(line) }],
		});
	},
};

export async function highlightCode(
	code: string,
	language: SupportedLanguage,
	showLineNumbers = false,
): Promise<readonly [string, string]> {
	const highlighter = await getHighlighter();

	const transformers: ShikiTransformer[] = showLineNumbers
		? [lineNumberTransformer]
		: [];

	return [
		highlighter.codeToHtml(code, {
			lang: language,
			theme: themeLight.name ?? "github-light",
			transformers,
		}),
		highlighter.codeToHtml(code, {
			lang: language,
			theme: themeDark.name ?? "github-dark",
			transformers,
		}),
	] as const;
}

export const CodeBlock = ({
	code,
	language,
	showLineNumbers = false,
	className,
	children,
	...props
}: CodeBlockProps) => {
	const [lightHtml, setLightHtml] = useState<string>("");
	const [darkHtml, setDarkHtml] = useState<string>("");
	const mounted = useRef(false);

	useEffect(() => {
		highlightCode(code, language, showLineNumbers).then(([light, dark]) => {
			if (!mounted.current) {
				setLightHtml(light);
				setDarkHtml(dark);
				mounted.current = true;
			}
		});

		return () => {
			mounted.current = false;
		};
	}, [code, language, showLineNumbers]);

	const baseClass =
		"overflow-hidden [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&>pre]:whitespace-pre-wrap [&_code]:font-mono [&_code]:text-sm";

	return (
		<CodeBlockContext.Provider value={{ code }}>
			<div
				className={cn(
					"group relative w-full overflow-hidden rounded-md border bg-background text-foreground",
					className,
				)}
				{...props}
			>
				<div className="relative">
					{/* Light Mode */}
					<div
						className={cn(baseClass, "dark:hidden")}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: must be added via this method as per the library
						dangerouslySetInnerHTML={{ __html: lightHtml }}
					/>

					{/* Dark Mode */}
					<div
						className={cn(baseClass, "hidden dark:block")}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: must be added via this method as per the library
						dangerouslySetInnerHTML={{ __html: darkHtml }}
					/>

					{children && (
						<div className="absolute top-1 right-1 flex items-center gap-2">
							{children}
						</div>
					)}
				</div>
			</div>
		</CodeBlockContext.Provider>
	);
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
	onCopy?: () => void;
	onError?: (error: Error) => void;
	timeout?: number;
};

export const CodeBlockCopyButton = ({
	onCopy,
	onError,
	timeout = 2000,
	children,
	className,
	...props
}: CodeBlockCopyButtonProps) => {
	const [isCopied, setIsCopied] = useState(false);
	const { code } = useContext(CodeBlockContext);

	const copyToClipboard = async () => {
		if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
			onError?.(new Error("Clipboard API not available"));
			return;
		}

		try {
			await navigator.clipboard.writeText(code);
			setIsCopied(true);
			onCopy?.();
			setTimeout(() => setIsCopied(false), timeout);
		} catch (error) {
			onError?.(error as Error);
		}
	};

	const Icon = isCopied ? CheckIcon : CopyIcon;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					className={cn("size-7 shrink-0 rounded-sm", className)}
					onClick={copyToClipboard}
					size="icon"
					variant="ghost"
					{...props}
				>
					{children ?? <Icon size={14} />}
				</Button>
			</TooltipTrigger>
			<TooltipContent>Copy to clipboard</TooltipContent>
		</Tooltip>
	);
};
