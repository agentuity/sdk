import React, { useState } from 'react';
import { WorkbenchProvider } from './internal/WorkbenchProvider';
import { Header } from './internal/Header';
import { Chat } from './internal/Chat';
import { Schema } from './internal/Schema';
import { ThemeProvider } from './ui/theme-provider';
import { ResizableProvider } from './ui/resizable-provider';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './ui/resizable';
import { useResizable } from './ui/resizable-provider';
import { decodeWorkbenchConfig } from '@agentuity/core/workbench';

export interface AppProps {
	configBase64: string;
}

function AppContent() {
	const [schemaOpen, setSchemaOpen] = useState(false);
	const { getPanelSizes, setPanelSizes } = useResizable();

	const defaultSizes = [55, 45];
	const panelSizes = getPanelSizes('main-layout') || defaultSizes;

	return (
		<div className="flex flex-col h-full">
			<Header />
			<ResizablePanelGroup
				direction="horizontal"
				className="flex-1"
				onLayout={(sizes) => {
					// Only save sizes when schema panel is open
					if (schemaOpen && sizes.length === 2) {
						setPanelSizes('main-layout', sizes);
					}
				}}
			>
				<ResizablePanel defaultSize={panelSizes[0]} minSize={30} className="flex flex-col">
					<Chat schemaOpen={schemaOpen} onSchemaToggle={() => setSchemaOpen(!schemaOpen)} />
				</ResizablePanel>
				{schemaOpen && (
					<>
						<ResizableHandle withHandle />
						<ResizablePanel defaultSize={panelSizes[1]} minSize={20} maxSize={50}>
							<Schema onOpenChange={setSchemaOpen} />
						</ResizablePanel>
					</>
				)}
			</ResizablePanelGroup>
		</div>
	);
}

export function App({ configBase64 }: AppProps) {
	const decodedConfig = decodeWorkbenchConfig(configBase64);
	return (
		<WorkbenchProvider config={decodedConfig}>
			<ThemeProvider>
				<ResizableProvider>
					<AppContent />
				</ResizableProvider>
			</ThemeProvider>
		</WorkbenchProvider>
	);
}

export default App;
