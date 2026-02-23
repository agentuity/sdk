/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import './index.css';

import { StrictMode } from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import { AgentuityProvider } from '@agentuity/react';
import { ThemeProvider } from './components/ThemeContext';
import { App } from './App';

const elem = document.getElementById('root');
if (!elem) {
	throw new Error('Root element not found');
}

const app = (
	<StrictMode>
		<ThemeProvider>
			<AgentuityProvider>
				<App />
			</AgentuityProvider>
		</ThemeProvider>
	</StrictMode>
);

if (import.meta.hot) {
	// With hot module reloading, `import.meta.hot.data` is persisted.
	if (!import.meta.hot.data.root) {
		import.meta.hot.data.root = createRoot(elem);
	}
	import.meta.hot.data.root.render(app);
} else {
	// Production: hydrate pre-rendered HTML
	hydrateRoot(elem, app);
}
