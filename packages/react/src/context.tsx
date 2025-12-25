import React, { useState, useEffect } from 'react';
import { createContext, useContext, type Context } from 'react';
import { defaultBaseUrl } from '@agentuity/frontend';
import { setGlobalBaseUrl, setGlobalAuthHeader } from './client';

export interface ContextProviderArgs {
	children?: React.ReactNode;
	baseUrl?: string;
	authHeader?: string | null;
}

export interface AgentuityContextValue {
	baseUrl: string;
	authHeader?: string | null;
	setAuthHeader?: (token: string | null) => void;
	authLoading?: boolean;
	setAuthLoading?: (loading: boolean) => void;
}

export const AgentuityContext: Context<AgentuityContextValue | null> =
	createContext<AgentuityContextValue | null>(null);

export const AgentuityProvider = ({
	baseUrl,
	authHeader: authHeaderProp,
	children,
}: ContextProviderArgs): React.JSX.Element => {
	const [authHeader, setAuthHeader] = useState<string | null>(authHeaderProp ?? null);
	const [authLoading, setAuthLoading] = useState<boolean>(false);
	const resolvedBaseUrl = baseUrl || defaultBaseUrl;

	// Set global baseUrl for RPC clients
	useEffect(() => {
		setGlobalBaseUrl(resolvedBaseUrl);
	}, [resolvedBaseUrl]);

	// Sync authHeader to global state for RPC clients
	useEffect(() => {
		setGlobalAuthHeader(authHeader);
	}, [authHeader]);

	// Sync authHeader prop changes to state
	useEffect(() => {
		if (authHeaderProp !== undefined) {
			setAuthHeader(authHeaderProp);
		}
	}, [authHeaderProp]);

	return (
		<AgentuityContext.Provider
			value={{
				baseUrl: resolvedBaseUrl,
				authHeader,
				setAuthHeader,
				authLoading,
				setAuthLoading,
			}}
		>
			{children}
		</AgentuityContext.Provider>
	);
};

export interface AgentuityHookValue {
	baseUrl: string;
}

/**
 * Hook to access Agentuity context (non-auth properties only).
 * For authentication state, use useAuth() instead.
 *
 * @throws Error if used outside of AgentuityProvider
 */
export function useAgentuity(): AgentuityHookValue {
	const context = useContext(AgentuityContext);
	if (!context || !context.baseUrl) {
		throw new Error('useAgentuity must be used within AgentuityProvider');
	}

	return {
		baseUrl: context.baseUrl,
	};
}

export interface AuthContextValue {
	authHeader?: string | null;
	setAuthHeader?: (token: string | null) => void;
	authLoading?: boolean;
	setAuthLoading?: (loading: boolean) => void;
	isAuthenticated: boolean;
}

/**
 * Low-level hook for Agentuity's transport auth.
 *
 * This hook exposes the Authorization header and loading state used by
 * Agentuity's API clients (useAPI, useWebsocket, etc.).
 *
 * **Important**: This does NOT provide user identity or session data.
 * For auth state in your app, use your auth provider's hooks instead:
 * - BetterAuth: `useSession()` from your auth client
 * - Clerk: `useAuth()` / `useUser()` from `@clerk/clerk-react`
 * - Auth0: `useAuth0()` from `@auth0/auth0-react`
 *
 * This hook is primarily used internally by auth bridge components
 * (AgentuityBetterAuth, AgentuityClerk, etc.) and for advanced use cases.
 *
 * @example
 * ```tsx
 * // For normal auth state, use your provider's hooks:
 * import { useSession } from './auth-client'; // BetterAuth
 * const { data: session } = useSession();
 *
 * // useAuth() is for advanced/internal use only:
 * import { useAuth } from '@agentuity/react';
 * const { authHeader, isAuthenticated } = useAuth();
 * ```
 *
 * @throws Error if used outside of AgentuityProvider
 */
export function useAuth(): AuthContextValue {
	const context = useContext(AgentuityContext);
	if (!context || !context.baseUrl) {
		throw new Error('useAuth must be used within AgentuityProvider');
	}

	// Convenience property: authenticated = has token and not loading
	const isAuthenticated = !context.authLoading && !!context.authHeader;

	return {
		authHeader: context.authHeader,
		setAuthHeader: context.setAuthHeader,
		authLoading: context.authLoading,
		setAuthLoading: context.setAuthLoading,
		isAuthenticated,
	};
}
