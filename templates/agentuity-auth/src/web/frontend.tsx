/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/web/index.html`.
 */

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentuityProvider } from '@agentuity/react';
import { AgentuityAuthProvider } from '@agentuity/auth/react';
import { AuthUIProvider } from '@daveyplate/better-auth-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { App } from './App';
import { authClient } from './auth-client';
import './index.css';

const queryClient = new QueryClient();

const elem = document.getElementById('root')!;
const app = (
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<AgentuityProvider>
				<AgentuityAuthProvider authClient={authClient}>
					<AuthUIProvider
						authClient={authClient}
						basePath="/auth"
						baseURL=""
						account={{
							basePath: '/account',
						}}
						organization={{
							basePath: '/organization',
						}}
					>
						<App />
						<Toaster richColors theme="dark" position="top-right" />
					</AuthUIProvider>
				</AgentuityAuthProvider>
			</AgentuityProvider>
		</QueryClientProvider>
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
