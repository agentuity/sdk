import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { DocsLayout } from '../components/docs';
import { ThemeProvider } from '../components/ThemeContext';
import '../index.css';

const browserBootstrapScript = `(function () {
	const stored = localStorage.getItem('theme-preference');
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	const isDark = stored === 'dark' || (stored !== 'light' && prefersDark);
	if (isDark) document.documentElement.classList.add('dark');

	const platform =
		(navigator.userAgentData && navigator.userAgentData.platform) ||
		navigator.platform ||
		navigator.userAgent;
	if (/mac|iphone|ipad|ipod/i.test(platform)) {
		document.documentElement.dataset.shortcutModifier = 'meta';
	}
})();`;

function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
			<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
				Page Not Found
			</h1>
			<p className="text-zinc-600 dark:text-zinc-400 mb-4">
				The page you're looking for doesn't exist.
			</p>
			<a href="/" className="text-cyan-700 dark:text-cyan-400 hover:underline transition-colors">
				Go to Home
			</a>
		</div>
	);
}

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1.0',
			},
			{
				title: 'Agentuity Documentation',
			},
			{
				name: 'description',
				content:
					'The full-stack cloud platform built for AI agents. Guides, interactive demos, and reference docs for building, deploying, and scaling agents with TypeScript.',
			},
		],
		links: [
			{
				rel: 'icon',
				type: 'image/x-icon',
				href: '/favicon.ico',
			},
		],
	}),
	component: RootComponent,
	shellComponent: RootDocument,
	notFoundComponent: NotFound,
});

function RootComponent() {
	return (
		<ThemeProvider>
			<DocsLayout />
		</ThemeProvider>
	);
}

function RootDocument({ children }: { readonly children: ReactNode }) {
	return (
		<html lang="en" className="h-full antialiased" suppressHydrationWarning>
			<head>
				<HeadContent />
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Static browser bootstrap prevents theme and shortcut-label flashes before hydration. */}
				<script dangerouslySetInnerHTML={{ __html: browserBootstrapScript }} />
			</head>
			<body className="h-full">
				{children}
				<Scripts />
			</body>
		</html>
	);
}
