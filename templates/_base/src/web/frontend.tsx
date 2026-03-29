/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentuityProvider } from '@agentuity/react';
import { App } from './App';

function init() {
	const elem = document.getElementById('root');
	if (!elem) {
		throw new Error('Root element not found');
	}

	const app = (
		<StrictMode>
			<AgentuityProvider>
				<App />
			</AgentuityProvider>
		</StrictMode>
	);

	if (import.meta.hot) {
		// With hot module reloading, `import.meta.hot.data` is persisted.
		const root = (import.meta.hot.data.root ??= createRoot(elem));
		root.render(app);
	} else {
		// The hot module reloading API is not available in production.
		createRoot(elem).render(app);
	}
}

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	// DOM is already ready
	init();
}
