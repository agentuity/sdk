import React, { useState } from 'react';
import { createContext, useContext, type Context } from 'react';
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

export const AgentuityProvider = ({ baseUrl, children }: ContextProviderArgs): React.JSX.Element => {
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

/**
 * Hook to access Agentuity context.
 *
 * @throws Error if used outside of AgentuityProvider
 */
export function useAgentuity(): AgentuityContextValue & { isAuthenticated: boolean } {
	const context = useContext(AgentuityContext);
	if (!context) {
		throw new Error('useAgentuity must be used within AgentuityProvider');
	}

	// Convenience property: authenticated = has token and not loading
	const isAuthenticated = !context.authLoading && context.authHeader !== null;

	return { ...context, isAuthenticated };
}
