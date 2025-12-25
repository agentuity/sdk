/**
 * Agentuity BetterAuth React integration.
 *
 * @module agentuity/client
 */

import React, { useEffect } from 'react';
import { useAuth } from '@agentuity/react';

export interface AgentuityBetterAuthProps {
	/** React children to render */
	children: React.ReactNode;

	/**
	 * Endpoint to fetch auth token from.
	 * Defaults to '/auth/token'.
	 * Should return JSON with { token: string | null }.
	 */
	tokenEndpoint?: string;

	/**
	 * Custom function to get the auth token.
	 * If provided, tokenEndpoint is ignored.
	 */
	getToken?: () => Promise<string | null>;

	/**
	 * Token refresh interval in milliseconds.
	 * Defaults to 60000 (1 minute).
	 */
	refreshInterval?: number;

	/**
	 * Whether the BetterAuth client is still loading.
	 * When true, shows loading state.
	 */
	isLoading?: boolean;
}

/**
 * Agentuity authentication provider for BetterAuth.
 *
 * This component integrates BetterAuth authentication with Agentuity's context,
 * automatically injecting auth tokens into API calls via useAPI and useWebsocket.
 *
 * Must be a child of AgentuityProvider.
 *
 * @example
 * ```tsx
 * import { AgentuityProvider } from '@agentuity/react';
 * import { AgentuityBetterAuth } from '@agentuity/auth/agentuity';
 *
 * <AgentuityProvider>
 *   <AgentuityBetterAuth>
 *     <App />
 *   </AgentuityBetterAuth>
 * </AgentuityProvider>
 * ```
 *
 * @example With custom token endpoint
 * ```tsx
 * <AgentuityBetterAuth tokenEndpoint="/api/auth/token">
 *   <App />
 * </AgentuityBetterAuth>
 * ```
 *
 * @example With custom token fetcher
 * ```tsx
 * <AgentuityBetterAuth
 *   getToken={async () => {
 *     const session = await myBetterAuthClient.getSession();
 *     return session?.token ?? null;
 *   }}
 * >
 *   <App />
 * </AgentuityBetterAuth>
 * ```
 */
export function AgentuityBetterAuth({
	children,
	tokenEndpoint = '/auth/token',
	getToken,
	refreshInterval = 60000,
	isLoading: externalIsLoading,
}: AgentuityBetterAuthProps) {
	const { setAuthHeader, setAuthLoading } = useAuth();

	useEffect(() => {
		if (!setAuthHeader || !setAuthLoading) return;

		if (externalIsLoading) {
			setAuthLoading(true);
			return;
		}

		const fetchToken = async () => {
			try {
				setAuthLoading(true);

				let token: string | null = null;

				if (getToken) {
					token = await getToken();
				} else {
					const res = await fetch(tokenEndpoint, {
						credentials: 'include',
					});
					if (res.ok) {
						const data = (await res.json()) as { token?: string | null };
						token = data.token ?? null;
					}
				}

				setAuthHeader(token ? `Bearer ${token}` : null);
			} catch (error) {
				console.error('[AgentuityBetterAuth] Failed to get token:', error);
				setAuthHeader(null);
			} finally {
				setAuthLoading(false);
			}
		};

		fetchToken();

		const interval = setInterval(fetchToken, refreshInterval);
		return () => clearInterval(interval);
	}, [getToken, tokenEndpoint, refreshInterval, setAuthHeader, setAuthLoading, externalIsLoading]);

	return <>{children}</>;
}
