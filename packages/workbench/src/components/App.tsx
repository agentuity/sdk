import { decodeWorkbenchConfig } from "@agentuity/core/workbench";
import { useState } from "react";
import { Chat } from "./internal/chat";
import { Header } from "./internal/header";
import { ResizableProvider, useResizable } from "./internal/resizable-provider";
import { Schema } from "./internal/schema";
import { WorkbenchProvider } from "./internal/workbench-provider";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "./ui/resizable";
import { ThemeProvider } from "./ui/theme-provider";
import { TooltipProvider } from "./ui/tooltip";

export interface AppProps {
	configBase64: string;
}

function AppContent() {
	const [schemaOpen, setSchemaOpen] = useState(false);
	const { getPanelSizes, setPanelSizes } = useResizable();
	const panelSizes = getPanelSizes("main-layout") || [70, 30];

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
					defaultSize={schemaOpen ? panelSizes[0] : 100}
					minSize={50}
					id="chat-panel"
					order={0}
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
							minSize={25}
							maxSize={50}
							id="schema-panel"
							order={1}
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
	const env = {
		agentuity: true,
		authenticated: import.meta.env.AGENTUITY_PUBLIC_HAS_SDK_KEY === "true",
		cloud: false,
	};

	return (
		<WorkbenchProvider config={decodedConfig} env={env}>
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
