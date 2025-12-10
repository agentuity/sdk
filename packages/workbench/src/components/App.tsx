import React from 'react';
import { WorkbenchProvider } from './internal/WorkbenchProvider';
import { Header } from './internal/Header';
import { ChatWithSchema } from './internal/ChatWithSchema';
import { ThemeProvider } from './ui/theme-provider';
import { ResizableProvider } from './ui/resizable-provider';
import { decodeWorkbenchConfig } from '@agentuity/core/workbench';

export interface AppProps {
	configBase64: string;
}

export function App({ configBase64 }: AppProps) {
	const decodedConfig = decodeWorkbenchConfig(configBase64);
	return (
		<WorkbenchProvider config={decodedConfig}>
			<ThemeProvider>
				<ResizableProvider>
					<div className="flex flex-col h-screen">
						<Header />
						<ChatWithSchema />
					</div>
				</ResizableProvider>
			</ThemeProvider>
		</WorkbenchProvider>
	);
}

export default App;
