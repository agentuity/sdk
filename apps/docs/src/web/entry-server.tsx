/**
 * Server-side rendering entry point.
 * Used by the prerender script to generate static HTML for each route.
 */

import { renderToString } from 'react-dom/server';
import { StrictMode } from 'react';
import { App } from './App';

export function render(url: string): string {
	return renderToString(
		<StrictMode>
			<App url={url} />
		</StrictMode>
	);
}
