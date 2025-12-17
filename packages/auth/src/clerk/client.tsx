/**
 * Clerk client-side authentication provider for React.
 *
 * @module clerk/client
 */

import React, { useEffect } from 'react';
import type { useAuth as ClerkUseAuth } from '@clerk/clerk-react';
import { useAuth } from '@agentuity/react';

type UseAuth = typeof ClerkUseAuth;

export interface AgentuityClerkProps {
	/** React children to render */
	children: React.ReactNode;

	/** Clerk's useAuth hook from @clerk/clerk-react */
	useAuth: UseAuth;

	/** Token refresh interval in milliseconds (default: 60000 = 1 minute) */
	refreshInterval?: number;
}

/**
 * Agentuity authentication provider for Clerk.
 *
 * This component integrates Clerk authentication with Agentuity's context,
 * automatically injecting auth tokens into API calls via useAPI and useWebsocket.
 *
 * Must be a child of both ClerkProvider and AgentuityProvider.
 *
 * @example
 * ```tsx
 * import { ClerkProvider, useAuth } from '@clerk/clerk-react';
 * import { AgentuityProvider } from '@agentuity/react';
 * import { AgentuityClerk } from '@agentuity/auth/clerk';
 *
 * <ClerkProvider publishableKey={key}>
 *   <AgentuityProvider>
 *     <AgentuityClerk useAuth={useAuth}>
 *       <App />
 *     </AgentuityClerk>
 *   </AgentuityProvider>
 * </ClerkProvider>
 * ```
 */
export function AgentuityClerk({
	children,
	useAuth: clerkUseAuth,
	refreshInterval = 60000,
}: AgentuityClerkProps) {
	const { getToken, isLoaded } = clerkUseAuth();
	const { setAuthHeader, setAuthLoading } = useAuth();

	// Fetch and update token in AgentuityContext
	useEffect(() => {
		if (!isLoaded || !setAuthHeader || !setAuthLoading) {
			if (setAuthLoading) {
				setAuthLoading(true);
			}
			return;
		}

		const fetchToken = async () => {
			try {
				setAuthLoading(true);
				const token = await getToken();
				setAuthHeader(token ? `Bearer ${token}` : null);
			} catch (error) {
				console.error('Failed to get Clerk token:', error);
				setAuthHeader(null);
			} finally {
				setAuthLoading(false);
			}
		};

		fetchToken();

		// Clerk handles token expiry internally, we refresh periodically
		const interval = setInterval(fetchToken, refreshInterval);
		return () => clearInterval(interval);
	}, [getToken, isLoaded, setAuthHeader, setAuthLoading, refreshInterval]);

	// Render children directly - auth header is now in AgentuityContext
	return <>{children}</>;
}
