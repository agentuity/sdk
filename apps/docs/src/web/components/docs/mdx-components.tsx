'use client';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Callout } from './callout';
import { Steps, Step } from './steps';
import { Tabs, Tab } from './tabs';
import { Cards, CardLink, ExternalCard } from './cards';
import { ThemeImage } from './theme-image';
import { CLICommand } from './cli-command';
import { GravityNetworkDiagram } from './gravity-network-diagram';
import { CopyMigrationPrompt } from './copy-migration-prompt';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MDXComponents = Record<string, React.ComponentType<any>>;

// Extended props for rehype-pretty-code output
interface PreProps extends ComponentPropsWithoutRef<'pre'> {
	'data-language'?: string;
	'data-theme'?: string;
}

interface CodeProps extends ComponentPropsWithoutRef<'code'> {
	'data-language'?: string;
	'data-theme'?: string;
}

// Helper to extract text from React children
function extractTextContent(node: ReactNode): string {
	if (typeof node === 'string') return node;
	if (typeof node === 'number') return String(node);
	if (!node) return '';
	if (Array.isArray(node)) return node.map(extractTextContent).join('');
	if (typeof node === 'object' && 'props' in node) {
		const element = node as React.ReactElement<{ children?: ReactNode }>;
		return extractTextContent(element.props.children);
	}
	return '';
}

// Code block with copy button - handles rehype-pretty-code output
function Pre({ className, children, ...props }: PreProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		const text = extractTextContent(children);
		if (text) {
			navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<div className="group relative mt-4">
			<pre
				className={cn(
					'overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-sm',
					'[&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit',
					className
				)}
				{...props}
			>
				{children}
			</pre>
			<button
				type="button"
				onClick={handleCopy}
				className={cn(
					'absolute top-3 right-3 p-1.5 rounded-md cursor-pointer',
					'opacity-0 group-hover:opacity-100 transition-opacity',
					'bg-zinc-200/80 dark:bg-zinc-700/80 hover:bg-zinc-300 dark:hover:bg-zinc-600',
					'text-zinc-600 dark:text-zinc-400'
				)}
				aria-label={copied ? 'Copied!' : 'Copy code'}
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

// Inline code (not in a pre block)
function InlineCode({ className, ...props }: CodeProps) {
	// If inside a pre block (has data-* attributes from rehype-pretty-code), don't style as inline
	const isCodeBlock = props['data-language'] || props['data-theme'];
	if (isCodeBlock) {
		return <code className={cn('font-mono', className)} {...props} />;
	}

	return (
		<code
			className={cn(
				'relative rounded bg-zinc-100 dark:bg-zinc-800 px-[0.3rem] py-[0.2rem] font-mono text-sm text-zinc-900 dark:text-zinc-100',
				className
			)}
			{...props}
		/>
	);
}

// Custom components for MDX rendering
export const mdxComponents: MDXComponents = {
	// Headings with anchor IDs
	h1: ({ className, children, ...props }: ComponentPropsWithoutRef<'h1'>) => {
		const id = typeof children === 'string' ? children.toLowerCase().replace(/\s+/g, '-') : undefined;
		return (
			<h1
				id={id}
				className={cn(
					'scroll-m-20 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-6',
					className
				)}
				{...props}
			>
				{children}
			</h1>
		);
	},
	h2: ({ className, children, ...props }: ComponentPropsWithoutRef<'h2'>) => {
		const id = typeof children === 'string' ? children.toLowerCase().replace(/\s+/g, '-') : undefined;
		return (
			<h2
				id={id}
				className={cn(
					'scroll-m-20 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mt-10 mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2',
					className
				)}
				{...props}
			>
				{children}
			</h2>
		);
	},
	h3: ({ className, children, ...props }: ComponentPropsWithoutRef<'h3'>) => {
		const id = typeof children === 'string' ? children.toLowerCase().replace(/\s+/g, '-') : undefined;
		return (
			<h3
				id={id}
				className={cn(
					'scroll-m-20 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mt-8 mb-3',
					className
				)}
				{...props}
			>
				{children}
			</h3>
		);
	},
	h4: ({ className, children, ...props }: ComponentPropsWithoutRef<'h4'>) => {
		const id = typeof children === 'string' ? children.toLowerCase().replace(/\s+/g, '-') : undefined;
		return (
			<h4
				id={id}
				className={cn(
					'scroll-m-20 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mt-6 mb-2',
					className
				)}
				{...props}
			>
				{children}
			</h4>
		);
	},

	// Paragraphs and text
	p: ({ className, ...props }: ComponentPropsWithoutRef<'p'>) => (
		<p
			className={cn('leading-7 text-zinc-600 dark:text-zinc-400 [&:not(:first-child)]:mt-4', className)}
			{...props}
		/>
	),
	strong: ({ className, ...props }: ComponentPropsWithoutRef<'strong'>) => (
		<strong className={cn('font-semibold text-zinc-900 dark:text-zinc-100', className)} {...props} />
	),
	em: ({ className, ...props }: ComponentPropsWithoutRef<'em'>) => (
		<em className={cn('italic', className)} {...props} />
	),

	// Links - white/dark text, cyan underline, dim on hover
	a: ({ className, href, children, ...props }: ComponentPropsWithoutRef<'a'>) => {
		const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
		return (
			<a
				className={cn(
					'text-zinc-900 dark:text-zinc-100 underline decoration-cyan-600 dark:decoration-cyan-400 underline-offset-4 hover:opacity-80 transition-opacity duration-200',
					className
				)}
				href={href}
				{...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
				{...props}
			>
				{children}
				{isExternal && (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="inline-block size-3 ml-0.5 -mt-0.5 opacity-60"
						aria-hidden="true"
					>
						<path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
						<path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
					</svg>
				)}
			</a>
		);
	},

	// Lists
	ul: ({ className, ...props }: ComponentPropsWithoutRef<'ul'>) => (
		<ul className={cn('my-4 ml-6 list-disc text-zinc-600 dark:text-zinc-400', className)} {...props} />
	),
	ol: ({ className, ...props }: ComponentPropsWithoutRef<'ol'>) => (
		<ol className={cn('my-4 ml-6 list-decimal text-zinc-600 dark:text-zinc-400', className)} {...props} />
	),
	li: ({ className, ...props }: ComponentPropsWithoutRef<'li'>) => (
		<li className={cn('mt-2', className)} {...props} />
	),

	// Blockquote
	blockquote: ({ className, ...props }: ComponentPropsWithoutRef<'blockquote'>) => (
		<blockquote
			className={cn(
				'mt-4 border-l-4 border-cyan-500 pl-4 italic text-zinc-600 dark:text-zinc-400',
				className
			)}
			{...props}
		/>
	),

	// Code blocks (with copy button)
	pre: Pre,
	code: InlineCode,

	// Tables
	table: ({ className, ...props }: ComponentPropsWithoutRef<'table'>) => (
		<div className="my-6 w-full overflow-x-auto">
			<table className={cn('w-full text-sm', className)} {...props} />
		</div>
	),
	thead: ({ className, ...props }: ComponentPropsWithoutRef<'thead'>) => (
		<thead className={cn('border-b border-zinc-200 dark:border-zinc-800', className)} {...props} />
	),
	tbody: ({ className, ...props }: ComponentPropsWithoutRef<'tbody'>) => (
		<tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
	),
	tr: ({ className, ...props }: ComponentPropsWithoutRef<'tr'>) => (
		<tr
			className={cn('border-b border-zinc-200 dark:border-zinc-800 transition-colors', className)}
			{...props}
		/>
	),
	th: ({ className, ...props }: ComponentPropsWithoutRef<'th'>) => (
		<th
			className={cn(
				'h-12 px-4 text-left align-middle font-medium text-zinc-900 dark:text-zinc-100',
				className
			)}
			{...props}
		/>
	),
	td: ({ className, ...props }: ComponentPropsWithoutRef<'td'>) => (
		<td
			className={cn('p-4 align-middle text-zinc-600 dark:text-zinc-400', className)}
			{...props}
		/>
	),

	// Horizontal rule
	hr: ({ className, ...props }: ComponentPropsWithoutRef<'hr'>) => (
		<hr className={cn('my-8 border-zinc-200 dark:border-zinc-800', className)} {...props} />
	),

	// Images
	img: ({ className, alt, ...props }: ComponentPropsWithoutRef<'img'>) => (
		<img
			className={cn('rounded-lg border border-zinc-200 dark:border-zinc-800', className)}
			alt={alt}
			loading="lazy"
			{...props}
		/>
	),

	// Documentation components
	Callout,
	Steps,
	Step,
	Tabs,
	Tab,
	Cards,
	CardLink,
	ExternalCard,
	Card: CardLink, // Alias for Fumadocs compatibility
	ThemeImage,
	CLICommand,
	GravityNetworkDiagram,
	CopyMigrationPrompt,
};
