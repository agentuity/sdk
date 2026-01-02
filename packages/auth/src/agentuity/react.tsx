/**
 * Auth React integration for @agentuity/auth.
 *
 * All React-specific code for auth.
 * Import from '@agentuity/auth/react' for React components and hooks.
 *
 * @module agentuity/react
 */

import React, { useEffect, createContext, useContext, useState, useMemo } from 'react';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';
import { organizationClient, apiKeyClient } from 'better-auth/client/plugins';
import { useAuth as useAgentuityReactAuth } from '@agentuity/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';

import type { AuthSession, AuthUser } from './types';

// =============================================================================
// Auth Client Factory
// =============================================================================

/**
 * Options for creating the auth client.
 *
 * @typeParam TPlugins - Array of BetterAuth client plugins for type inference
 */
export interface AuthClientOptions<
	TPlugins extends BetterAuthClientPlugin[] = BetterAuthClientPlugin[],
> {
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
	 *
	 * Plugin types are inferred for full type safety.
	 */
	plugins?: TPlugins;
}

/**
 * Get the default client plugins for auth.
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
 * Create a pre-configured Auth client.
 *
 * This factory provides sensible defaults for Agentuity projects:
 * - Uses `/api/auth` as the default base path
 * - Automatically uses `window.location.origin` as base URL in browsers
 * - Includes organization and API key plugins by default
 *
 * @example Basic usage (zero config)
 * ```typescript
 * import { createAuthClient } from '@agentuity/auth/react';
 *
 * export const authClient = createAuthClient();
 * export const { signIn, signUp, signOut, useSession, getSession } = authClient;
 * ```
 *
 * @example With custom base path
 * ```typescript
 * export const authClient = createAuthClient({
 *   basePath: '/auth', // If mounted at /auth instead of /api/auth
 * });
 * ```
 *
 * @example With additional plugins
 * ```typescript
 * import { twoFactorClient } from 'better-auth/client/plugins';
 *
 * export const authClient = createAuthClient({
 *   plugins: [twoFactorClient()],
 * });
 * ```
 *
 * @example With custom plugins only (no defaults)
 * ```typescript
 * import { organizationClient } from 'better-auth/client/plugins';
 *
 * export const authClient = createAuthClient({
 *   skipDefaultPlugins: true,
 *   plugins: [organizationClient()],
 * });
 * ```
 */
export function createAuthClient<TPlugins extends BetterAuthClientPlugin[] = []>(
	options?: AuthClientOptions<TPlugins>
): ReturnType<typeof createBetterAuthClient<{ plugins: TPlugins }>> {
	const baseURL =
		options?.baseURL ?? (typeof window !== 'undefined' ? window.location.origin : '');
	const basePath = options?.basePath ?? '/api/auth';

	const defaultPlugins = options?.skipDefaultPlugins ? [] : getDefaultClientPlugins();
	const userPlugins = options?.plugins ?? [];

	// Merge default plugins with user plugins
	// We pass through the full options to preserve type inference
	// The return type preserves plugin type inference via the generic parameter
	return createBetterAuthClient({
		...options,
		baseURL,
		basePath,
		plugins: [...defaultPlugins, ...userPlugins],
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any;
}

/**
 * Type helper for the auth client return type.
 */
export type AuthClient = ReturnType<typeof createAuthClient>;

// =============================================================================
// React Provider and Hooks
// =============================================================================

/**
 * Context value for Auth.
 */
export interface AuthContextValue {
	/** The auth client instance */
	authClient: AuthClient;
	/** Current authenticated user, or null if not signed in */
	user: AuthUser | null;
	/** Current session object (if available) */
	session: AuthSession | null;
	/** Whether the auth state is still loading */
	isPending: boolean;
	/** Any error that occurred while fetching auth state */
	error: Error | null;
	/** Whether the user is authenticated */
	isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
	/** React children to render */
	children: React.ReactNode;

	/**
	 * The auth client instance created with createAuthClient().
	 * Required for session management.
	 */
	authClient: AuthClient;

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
	 * <AuthProvider authClient={authClient} tokenEndpoint="/api/custom/jwt">
	 * ```
	 *
	 * @example Disable token fetching
	 * ```tsx
	 * <AuthProvider authClient={authClient} tokenEndpoint={false}>
	 * ```
	 */
	tokenEndpoint?: string | false;
}

/**
 * Auth provider component.
 *
 * This component integrates Auth with Agentuity's React context,
 * automatically injecting auth tokens into API calls via useAgent and useWebsocket.
 *
 * Must be a child of AgentuityProvider.
 *
 * @example
 * ```tsx
 * import { AgentuityProvider } from '@agentuity/react';
 * import { createAuthClient, AuthProvider } from '@agentuity/auth/react';
 *
 * const authClient = createAuthClient();
 *
 * <AgentuityProvider>
 *   <AuthProvider authClient={authClient}>
 *     <App />
 *   </AuthProvider>
 * </AgentuityProvider>
 * ```
 */
export function AuthProvider({
	children,
	authClient,
	refreshInterval = 60000,
	tokenEndpoint = '/token',
}: AuthProviderProps) {
	const { setAuthHeader, setAuthLoading } = useAgentuityReactAuth();
	const [user, setUser] = useState<AuthUser | null>(null);
	const [session, setSession] = useState<AuthSession | null>(null);
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
					setUser(result.data.user as AuthUser);
					setSession((result.data.session as AuthSession) ?? null);

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
					setSession(null);
					setAuthHeader(null);
				}
			} catch (err) {
				console.error('[AuthProvider] Failed to get auth state:', err);
				setError(err instanceof Error ? err : new Error('Failed to get auth state'));
				setUser(null);
				setSession(null);
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
			session,
			isPending,
			error,
			isAuthenticated: !isPending && user !== null,
		}),
		[authClient, user, session, isPending, error]
	);

	return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access Auth state.
 *
 * This hook provides access to the current user and session.
 * Must be used within an AuthProvider.
 *
 * @example
 * ```tsx
 * import { useAuth } from '@agentuity/auth/react';
 *
 * function Profile() {
 *   const { user, session, isPending, isAuthenticated } = useAuth();
 *
 *   if (isPending) return <div>Loading...</div>;
 *   if (!isAuthenticated) return <div>Not signed in</div>;
 *
 *   return <div>Welcome, {user.name}!</div>;
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
}
