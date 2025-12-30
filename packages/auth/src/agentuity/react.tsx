/**
 * Agentuity Auth React integration.
 *
 * All React-specific code for Agentuity Auth.
 * Import from '@agentuity/auth/react' for React components and hooks.
 *
 * @module agentuity/react
 */

import React, { useEffect, createContext, useContext, useState, useMemo } from 'react';
import { createAuthClient } from 'better-auth/react';
import { organizationClient, apiKeyClient } from 'better-auth/client/plugins';
import { useAuth } from '@agentuity/react';

// =============================================================================
// Auth Client Factory
// =============================================================================

/**
 * Options for creating the Agentuity auth client.
 */
export interface AgentuityAuthClientOptions {
	/**
	 * Base URL for auth API requests.
	 * Defaults to `window.location.origin` in browser environments.
	 */
	baseURL?: string;

	/**
	 * Base path for auth endpoints.
	 * Defaults to '/api/auth' (Agentuity convention).
	 */
	basePath?: string;

	/**
	 * Skip default plugins (organizationClient, apiKeyClient).
	 * Use this if you want full control over plugins.
	 */
	skipDefaultPlugins?: boolean;

	/**
	 * Additional plugins to include.
	 * These are added after the default plugins (unless skipDefaultPlugins is true).
	 */
	plugins?: ReturnType<typeof organizationClient>[];
}

/**
 * Get the default client plugins for Agentuity auth.
 *
 * These mirror the server-side plugins:
 * - organizationClient: Multi-tenancy support
 * - apiKeyClient: Programmatic API key management
 *
 * Note: jwt() and bearer() are server-only plugins.
 */
export function getDefaultClientPlugins() {
	return [organizationClient(), apiKeyClient()];
}

/**
 * Create a pre-configured Agentuity Auth client.
 *
 * This factory provides sensible defaults for Agentuity projects:
 * - Uses `/api/auth` as the default base path
 * - Automatically uses `window.location.origin` as base URL in browsers
 * - Includes organization and API key plugins by default
 *
 * @example Basic usage (zero config)
 * ```typescript
 * import { createAgentuityAuthClient } from '@agentuity/auth/react';
 *
 * export const authClient = createAgentuityAuthClient();
 * export const { signIn, signUp, signOut, useSession, getSession } = authClient;
 * ```
 *
 * @example With custom base path
 * ```typescript
 * export const authClient = createAgentuityAuthClient({
 *   basePath: '/auth', // If mounted at /auth instead of /api/auth
 * });
 * ```
 *
 * @example With additional plugins
 * ```typescript
 * import { twoFactorClient } from 'better-auth/client/plugins';
 *
 * export const authClient = createAgentuityAuthClient({
 *   plugins: [twoFactorClient()],
 * });
 * ```
 *
 * @example With custom plugins only (no defaults)
 * ```typescript
 * import { organizationClient } from 'better-auth/client/plugins';
 *
 * export const authClient = createAgentuityAuthClient({
 *   skipDefaultPlugins: true,
 *   plugins: [organizationClient()],
 * });
 * ```
 */
export function createAgentuityAuthClient(options: AgentuityAuthClientOptions = {}) {
	const baseURL = options.baseURL ?? (typeof window !== 'undefined' ? window.location.origin : '');
	const basePath = options.basePath ?? '/api/auth';

	const defaultPlugins = options.skipDefaultPlugins ? [] : getDefaultClientPlugins();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const plugins = [...defaultPlugins, ...(options.plugins ?? [])] as any[];

	return createAuthClient({
		baseURL,
		basePath,
		plugins,
	});
}

/**
 * Type helper for the auth client return type.
 */
export type AgentuityAuthClient = ReturnType<typeof createAgentuityAuthClient>;

// =============================================================================
// React Provider and Hooks
// =============================================================================

/**
 * User data from the auth client.
 */
export interface AgentuityAuthUser {
	id: string;
	name?: string;
	email?: string;
	emailVerified?: boolean;
	image?: string;
	createdAt?: Date;
	updatedAt?: Date;
}

/**
 * Context value for Agentuity Auth.
 */
export interface AgentuityAuthContextValue {
	/** The auth client instance */
	authClient: AgentuityAuthClient;
	/** Current authenticated user, or null if not signed in */
	user: AgentuityAuthUser | null;
	/** Whether the auth state is still loading */
	isPending: boolean;
	/** Any error that occurred while fetching auth state */
	error: Error | null;
	/** Whether the user is authenticated */
	isAuthenticated: boolean;
}

const AgentuityAuthContext = createContext<AgentuityAuthContextValue | null>(null);

export interface AgentuityAuthProviderProps {
	/** React children to render */
	children: React.ReactNode;

	/**
	 * The auth client instance created with createAgentuityAuthClient().
	 * Required for session management.
	 */
	authClient: AgentuityAuthClient;

	/**
	 * Token refresh interval in milliseconds.
	 * Defaults to 60000 (1 minute).
	 */
	refreshInterval?: number;

	/**
	 * Override the token endpoint path.
	 * Defaults to '/token' (relative to the auth client's basePath).
	 * Set to `false` to disable token fetching entirely.
	 *
	 * @example Custom token endpoint
	 * ```tsx
	 * <AgentuityAuthProvider authClient={authClient} tokenEndpoint="/api/custom/jwt">
	 * ```
	 *
	 * @example Disable token fetching
	 * ```tsx
	 * <AgentuityAuthProvider authClient={authClient} tokenEndpoint={false}>
	 * ```
	 */
	tokenEndpoint?: string | false;
}

/**
 * Agentuity Auth provider component.
 *
 * This component integrates Agentuity Auth with Agentuity's React context,
 * automatically injecting auth tokens into API calls via useAgent and useWebsocket.
 *
 * Must be a child of AgentuityProvider.
 *
 * @example
 * ```tsx
 * import { AgentuityProvider } from '@agentuity/react';
 * import { createAgentuityAuthClient, AgentuityAuthProvider } from '@agentuity/auth/react';
 *
 * const authClient = createAgentuityAuthClient();
 *
 * <AgentuityProvider>
 *   <AgentuityAuthProvider authClient={authClient}>
 *     <App />
 *   </AgentuityAuthProvider>
 * </AgentuityProvider>
 * ```
 */
export function AgentuityAuthProvider({
	children,
	authClient,
	refreshInterval = 60000,
	tokenEndpoint = '/token',
}: AgentuityAuthProviderProps) {
	const { setAuthHeader, setAuthLoading } = useAuth();
	const [user, setUser] = useState<AgentuityAuthUser | null>(null);
	const [isPending, setIsPending] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		if (!setAuthHeader || !setAuthLoading) return;

		const fetchAuthState = async () => {
			try {
				setAuthLoading(true);
				setIsPending(true);
				setError(null);

				// Use the auth client's getSession method
				const result = await authClient.getSession();

				if (result.data?.user) {
					setUser(result.data.user as AgentuityAuthUser);

					// Get the JWT token for API calls (unless disabled)
					if (tokenEndpoint !== false) {
						try {
							const tokenResult = await authClient.$fetch(tokenEndpoint, { method: 'GET' });
							const tokenData = tokenResult.data as { token?: string } | undefined;
							if (tokenData?.token) {
								setAuthHeader(`Bearer ${tokenData.token}`);
							} else {
								setAuthHeader(null);
							}
						} catch {
							// Token endpoint might not exist, that's okay
							setAuthHeader(null);
						}
					} else {
						setAuthHeader(null);
					}
				} else {
					setUser(null);
					setAuthHeader(null);
				}
			} catch (err) {
				console.error('[AgentuityAuthProvider] Failed to get auth state:', err);
				setError(err instanceof Error ? err : new Error('Failed to get auth state'));
				setUser(null);
				setAuthHeader(null);
			} finally {
				setAuthLoading(false);
				setIsPending(false);
			}
		};

		fetchAuthState();

		const interval = setInterval(fetchAuthState, refreshInterval);
		return () => clearInterval(interval);
	}, [authClient, refreshInterval, tokenEndpoint, setAuthHeader, setAuthLoading]);

	const contextValue = useMemo(
		() => ({
			authClient,
			user,
			isPending,
			error,
			isAuthenticated: !isPending && user !== null,
		}),
		[authClient, user, isPending, error]
	);

	return (
		<AgentuityAuthContext.Provider value={contextValue}>{children}</AgentuityAuthContext.Provider>
	);
}

/**
 * Hook to access Agentuity Auth state.
 *
 * This hook provides access to the current user from Agentuity Auth.
 * Must be used within an AgentuityAuthProvider.
 *
 * @example
 * ```tsx
 * import { useAgentuityAuth } from '@agentuity/auth/react';
 *
 * function Profile() {
 *   const { user, isPending, isAuthenticated } = useAgentuityAuth();
 *
 *   if (isPending) return <div>Loading...</div>;
 *   if (!isAuthenticated) return <div>Not signed in</div>;
 *
 *   return <div>Welcome, {user.name}!</div>;
 * }
 * ```
 */
export function useAgentuityAuth(): AgentuityAuthContextValue {
	const context = useContext(AgentuityAuthContext);
	if (!context) {
		throw new Error('useAgentuityAuth must be used within an AgentuityAuthProvider');
	}
	return context;
}
