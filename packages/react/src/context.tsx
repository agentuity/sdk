import React, { useState, useEffect } from 'react';
import { createContext, useContext, type Context } from 'react';
<<<<<<< Updated upstream
import { defaultBaseUrl } from '@agentuity/frontend';
import { setGlobalBaseUrl, setGlobalAuthHeader } from './client';
=======
import { defaultBaseUrl } from '@agentuity/web';
>>>>>>> Stashed changes

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
 * Hook to access authentication-specific functionality.
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
