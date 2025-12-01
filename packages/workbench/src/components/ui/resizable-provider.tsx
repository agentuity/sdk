import { createContext, useContext, useEffect, useState } from "react";

type PanelSizes = Record<string, number[]>;

type ResizableProviderProps = {
	children: React.ReactNode;
	storageKey?: string;
};

type ResizableProviderState = {
	panelSizes: PanelSizes;
	setPanelSizes: (groupId: string, sizes: number[]) => void;
	getPanelSizes: (groupId: string) => number[] | undefined;
	resetPanelSizes: (groupId?: string) => void;
};

const initialState: ResizableProviderState = {
	panelSizes: {},
	setPanelSizes: () => null,
	getPanelSizes: () => undefined,
	resetPanelSizes: () => null,
};

const ResizableProviderContext =
	createContext<ResizableProviderState>(initialState);

export function ResizableProvider({
	children,
	storageKey = "agentuity-workbench-panel-sizes",
	...props
}: ResizableProviderProps) {
	const [panelSizes, setPanelSizesState] = useState<PanelSizes>(() => {
		try {
			const stored = localStorage.getItem(storageKey);

			return stored ? JSON.parse(stored) : {};
		} catch {
			return {};
		}
	});

	useEffect(() => {
		localStorage.setItem(storageKey, JSON.stringify(panelSizes));
	}, [panelSizes, storageKey]);

	const value = {
		panelSizes,
		setPanelSizes: (groupId: string, sizes: number[]) => {
			const roundedSizes = sizes.map((size) => Math.round(size));

			setPanelSizesState((prev) => ({
				...prev,
				[groupId]: roundedSizes,
			}));
		},
		getPanelSizes: (groupId: string) => panelSizes[groupId],
		resetPanelSizes: (groupId?: string) => {
			if (groupId) {
				setPanelSizesState((prev) => {
					const { [groupId]: _, ...rest } = prev;
					return rest;
				});
			} else {
				setPanelSizesState({});
			}
		},
	};

	return (
		<ResizableProviderContext.Provider {...props} value={value}>
			{children}
		</ResizableProviderContext.Provider>
	);
}

export const useResizable = () => {
	const context = useContext(ResizableProviderContext);

	if (context === undefined) {
		throw new Error("useResizable must be used within a ResizableProvider");
	}

	return context;
};
