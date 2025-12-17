/**
 * Auth0 client-side authentication provider for React.
 *
 * @module auth0/client
 */

import React, { useEffect, useRef } from 'react';
import type { useAuth0 as Auth0UseAuth } from '@auth0/auth0-react';
import { useAuth } from '@agentuity/react';

type UseAuth0 = typeof Auth0UseAuth;

export interface AgentuityAuth0Props {
    /** React children to render */
    children: React.ReactNode;

    /** Auth0's useAuth0 hook from @auth0/auth0-react */
    useAuth0: UseAuth0;

    /** Token refresh interval in milliseconds (default: 60000 = 1 minute) */
    refreshInterval?: number;

    /** Options to pass to getAccessTokenSilently */
    tokenOptions?: Parameters<ReturnType<UseAuth0>['getAccessTokenSilently']>[0];
}

/**
 * Agentuity authentication provider for Auth0.
 *
 * This component integrates Auth0 authentication with Agentuity's context,
 * automatically injecting auth tokens into API calls via useAPI and useWebsocket.
 *
 * Must be a child of both Auth0Provider and AgentuityProvider.
 *
 * @example
 * ```tsx
 * import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
 * import { AgentuityProvider } from '@agentuity/react';
 * import { AgentuityAuth0 } from '@agentuity/auth/auth0';
 *
 * <Auth0Provider domain={domain} clientId={clientId} authorizationParams={{ redirect_uri: window.location.origin }}>
 *   <AgentuityProvider>
 *     <AgentuityAuth0 useAuth0={useAuth0}>
 *       <App />
 *     </AgentuityAuth0>
 *   </AgentuityProvider>
 * </Auth0Provider>
 * ```
 */
export function AgentuityAuth0({
	children,
	useAuth0,
	refreshInterval = 60000,
	tokenOptions,
}: AgentuityAuth0Props) {
	const { getAccessTokenSilently, isLoading, isAuthenticated } = useAuth0();
	const { setAuthHeader, setAuthLoading } = useAuth();

	// Use ref for tokenOptions to avoid infinite re-renders when parent passes inline object
	const tokenOptionsRef = useRef(tokenOptions);
	tokenOptionsRef.current = tokenOptions;

	useEffect(() => {
		if (isLoading || !setAuthHeader || !setAuthLoading) {
			if (setAuthLoading) {
				setAuthLoading(true);
			}
			return;
		}

		// Not authenticated - clear auth header
		if (!isAuthenticated) {
			setAuthHeader(null);
			setAuthLoading(false);
			return;
		}

		const fetchToken = async () => {
			try {
				setAuthLoading(true);
				const token = await getAccessTokenSilently(tokenOptionsRef.current);
				setAuthHeader(token ? `Bearer ${token}` : null);
			} catch (error) {
				console.error('Failed to get Auth0 token:', error instanceof Error ? error.message : 'Unknown error');
				setAuthHeader(null);
			} finally {
				setAuthLoading(false);
			}
		};

		fetchToken();

		// Refresh token periodically
		const interval = setInterval(fetchToken, refreshInterval);
		return () => clearInterval(interval);
	}, [getAccessTokenSilently, isLoading, isAuthenticated, setAuthHeader, setAuthLoading, refreshInterval]);

	return <>{children}</>;
}
