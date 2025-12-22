import { decodeWorkbenchConfig } from "@agentuity/core/workbench";
import React, { useState } from "react";
import { Chat } from "./internal/Chat";
import { Header } from "./internal/Header";
import { Schema } from "./internal/Schema";
import { WorkbenchProvider } from "./internal/WorkbenchProvider";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "./ui/resizable";
import { ResizableProvider, useResizable } from "./ui/resizable-provider";
import { ThemeProvider } from "./ui/theme-provider";
import { TooltipProvider } from "./ui/tooltip";

export interface AppProps {
	configBase64: string;
}

function AppContent() {
	const [schemaOpen, setSchemaOpen] = useState(false);
	const { getPanelSizes, setPanelSizes } = useResizable();

	const defaultSizes = [55, 45];
	const panelSizes = getPanelSizes("main-layout") || defaultSizes;

	return (
		<div className="flex flex-col h-full">
			<Header />
			<ResizablePanelGroup
				direction="horizontal"
				className="flex-1"
				onLayout={(sizes) => {
					// Only save sizes when schema panel is open
					if (schemaOpen && sizes.length === 2) {
						setPanelSizes("main-layout", sizes);
					}
				}}
			>
				<ResizablePanel
					defaultSize={panelSizes[0]}
					minSize={30}
					className="flex flex-col"
				>
					<Chat
						schemaOpen={schemaOpen}
						onSchemaToggle={() => setSchemaOpen(!schemaOpen)}
					/>
				</ResizablePanel>
				{schemaOpen && (
					<>
						<ResizableHandle withHandle />
						<ResizablePanel
							defaultSize={panelSizes[1]}
							minSize={20}
							maxSize={50}
						>
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
	const isAuthenticated =
		import.meta.env.AGENTUITY_PUBLIC_HAS_SDK_KEY === "true";

	return (
		<WorkbenchProvider config={decodedConfig} isAuthenticated={isAuthenticated}>
			<ThemeProvider>
				<TooltipProvider>
					<ResizableProvider>
						<AppContent />
					</ResizableProvider>
				</TooltipProvider>
			</ThemeProvider>
		</WorkbenchProvider>
	);
}

export default App;
