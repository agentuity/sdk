/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { AgentuityProvider } from '@agentuity/react';
import { AgentuityClerk } from '@agentuity/auth/clerk';
import { App } from './App';

const CLERK_PUBLISHABLE_KEY = process.env.AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
	throw new Error('Missing AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env file');
}

const elem = document.getElementById('root')!;
const app = (
	<StrictMode>
		<ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
			<AgentuityProvider>
				<AgentuityClerk useAuth={useAuth}>
					<App />
				</AgentuityClerk>
			</AgentuityProvider>
		</ClerkProvider>
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
