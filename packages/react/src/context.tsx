import React, { useState } from 'react';
import { createContext, useContext, type Context, type ReactElement } from 'react';
import { defaultBaseUrl } from './url';

export interface ContextProviderArgs {
	children?: React.ReactNode;
	baseUrl?: string;
}

export interface AgentuityContextValue {
	baseUrl: string;
	authHeader?: string | null;
	setAuthHeader?: (token: string | null) => void;
	authLoading?: boolean;
	setAuthLoading?: (loading: boolean) => void;
}

export const AgentuityContext: Context<AgentuityContextValue> =
	createContext<AgentuityContextValue>({
		baseUrl: '',
	});

export const AgentuityProvider = ({ baseUrl, children }: ContextProviderArgs): ReactElement => {
	const [authHeader, setAuthHeader] = useState<string | null>(null);
	const [authLoading, setAuthLoading] = useState<boolean>(false);

	return (
		<AgentuityContext.Provider
			value={{
				baseUrl: baseUrl || defaultBaseUrl,
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
	if (!context) {
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
	if (!context) {
		throw new Error('useAuth must be used within AgentuityProvider');
	}

	// Convenience property: authenticated = has token and not loading
	const isAuthenticated = !context.authLoading && context.authHeader !== null;

	return {
		authHeader: context.authHeader,
		setAuthHeader: context.setAuthHeader,
		authLoading: context.authLoading,
		setAuthLoading: context.setAuthLoading,
		isAuthenticated,
	};
}
