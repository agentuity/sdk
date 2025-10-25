import React from 'react';
import { createContext, Context, type ReactElement } from 'react';
import { defaultBaseUrl } from './url';

export interface ContextProviderArgs {
	children?: React.ReactNode;
	baseUrl?: string;
}

export const AgentuityContext: Context<ContextProviderArgs> = createContext<ContextProviderArgs>({
	baseUrl: '',
});

export const AgentuityProvider = ({ baseUrl, children }: ContextProviderArgs): ReactElement => {
	return (
		<AgentuityContext.Provider value={{ baseUrl: baseUrl || defaultBaseUrl }}>
			{children}
		</AgentuityContext.Provider>
	);
};
