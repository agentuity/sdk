"use client";

import {
	AlertTriangleIcon,
	CheckIcon,
	ChevronDownIcon,
	CopyIcon,
} from "lucide-react";
import { type HTMLAttributes, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export interface ErrorInfo {
	message: string;
	stack?: string;
	code?: string;
	cause?: unknown;
}

type ErrorBubbleProps = HTMLAttributes<HTMLDivElement> & {
	error: ErrorInfo;
};

export const ErrorBubble = ({
	error,
	className,
	...props
}: ErrorBubbleProps) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const [isCopied, setIsCopied] = useState(false);

	const copyError = async () => {
		const text = [
			error.code ? `[${error.code}] ${error.message}` : error.message,
			error.stack,
			error.cause ? `Cause: ${JSON.stringify(error.cause, null, 2)}` : null,
		]
			.filter(Boolean)
			.join("\n\n");

		await navigator.clipboard.writeText(text);
		setIsCopied(true);
		setTimeout(() => setIsCopied(false), 2000);
	};

	return (
		<div
			className={cn(
				"w-full overflow-hidden rounded-md border border-destructive/50 bg-destructive/10 text-destructive",
				className,
			)}
			{...props}
		>
			{/* Header */}
			<div className="flex items-center gap-2 px-3 py-2 border-b border-destructive/20 bg-destructive/5">
				<AlertTriangleIcon className="size-4 shrink-0" />
				<span className="font-medium text-sm flex-1">
					{error.code ? `${error.code}: ` : ""}
					Agent Error
				</span>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="size-6 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/20"
							onClick={copyError}
							size="icon"
							variant="ghost"
						>
							{isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
						</Button>
					</TooltipTrigger>
					<TooltipContent>Copy error</TooltipContent>
				</Tooltip>

				{error.stack && (
					<Button
						className="size-6 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/20"
						onClick={() => setIsExpanded(!isExpanded)}
						size="icon"
						variant="ghost"
					>
						<ChevronDownIcon
							size={14}
							className={cn("transition-transform", isExpanded && "rotate-180")}
						/>
					</Button>
				)}
			</div>

			{/* Error Message */}
			<div className="px-3 py-2 text-sm">
				<p className="font-medium">{error.message}</p>
			</div>

			{/* Stack Trace (collapsible) */}
			{error.stack && isExpanded && (
				<div className="px-3 pb-3">
					<pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto p-2 rounded bg-destructive/5 text-destructive/80 max-h-64 overflow-y-auto">
						{error.stack}
					</pre>
				</div>
			)}

			{/* Cause (if present) */}
			{error.cause !== undefined && isExpanded && (
				<div className="px-3 pb-3">
					<p className="text-xs font-medium mb-1 text-destructive/70">Cause:</p>
					<pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto p-2 rounded bg-destructive/5 text-destructive/80">
						{typeof error.cause === "object" && error.cause !== null
							? JSON.stringify(error.cause, null, 2)
							: String(error.cause)}
					</pre>
				</div>
			)}
		</div>
	);
};
