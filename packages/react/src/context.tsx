import React, { useState, useLayoutEffect, useMemo, useCallback } from 'react';
import { createContext, useContext, type Context } from 'react';
import { defaultBaseUrl } from '@agentuity/frontend';

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
	const [authHeader, setAuthHeaderState] = useState<string | null>(authHeaderProp ?? null);
	const [authLoading, setAuthLoadingState] = useState<boolean>(false);
	const resolvedBaseUrl = baseUrl || defaultBaseUrl;

	// Memoize setter functions to prevent unnecessary re-renders
	const setAuthHeader = useCallback((token: string | null) => {
		setAuthHeaderState(token);
	}, []);

	const setAuthLoading = useCallback((loading: boolean) => {
		setAuthLoadingState(loading);
	}, []);

	// Sync authHeader prop changes to state synchronously
	// useLayoutEffect ensures the state is updated before child effects run,
	// preventing race conditions where API hooks make requests before auth is set (issue #732)
	useLayoutEffect(() => {
		if (authHeaderProp !== undefined) {
			setAuthHeaderState(authHeaderProp);
		}
	}, [authHeaderProp]);

	// Memoize context value to prevent unnecessary re-renders
	const contextValue = useMemo(
		() => ({
			baseUrl: resolvedBaseUrl,
			authHeader,
			setAuthHeader,
			authLoading,
			setAuthLoading,
		}),
		[resolvedBaseUrl, authHeader, setAuthHeader, authLoading, setAuthLoading]
	);

	return <AgentuityContext.Provider value={contextValue}>{children}</AgentuityContext.Provider>;
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
 * Agentuity's API clients.
 *
 * @example
 * ```tsx
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
