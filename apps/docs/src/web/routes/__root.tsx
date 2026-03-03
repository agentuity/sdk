import { createRootRoute } from '@tanstack/react-router';
import { DocsLayout } from '../components/docs/index.ts';

function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
			<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
				Page Not Found
			</h1>
			<p className="text-zinc-600 dark:text-zinc-400 mb-4">
				The page you're looking for doesn't exist.
			</p>
			<a href="/" className="text-cyan-600 dark:text-cyan-400 hover:underline transition-colors">
				Go to SDK Explorer
			</a>
		</div>
	);
}

export const Route = createRootRoute({
	component: DocsLayout,
	notFoundComponent: NotFound,
});
