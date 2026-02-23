import type { ReactNode } from 'react';
import { createContext, useContext, useState, useCallback } from 'react';

export interface TocItem {
	id: string;
	value: string;
	depth: number;
	children?: TocItem[];
}

interface TocContextValue {
	headings: TocItem[];
	setHeadings: (headings: TocItem[]) => void;
	activeId: string;
	setActiveId: (id: string) => void;
	scrollToHeading: (id: string) => void;
}

const TocContext = createContext<TocContextValue | null>(null);

export function TocProvider({ children }: { children: ReactNode }) {
	const [headings, setHeadings] = useState<TocItem[]>([]);
	const [activeId, setActiveId] = useState<string>('');

	const scrollToHeading = useCallback((id: string) => {
		const element = document.getElementById(id);
		if (element) {
			const offset = 80;
			const elementPosition = element.getBoundingClientRect().top;
			const offsetPosition = elementPosition + window.scrollY - offset;

			window.scrollTo({
				top: offsetPosition,
				behavior: 'smooth',
			});
			setActiveId(id);
		}
	}, []);

	return (
		<TocContext.Provider
			value={{ headings, setHeadings, activeId, setActiveId, scrollToHeading }}
		>
			{children}
		</TocContext.Provider>
	);
}

export function useToc() {
	const context = useContext(TocContext);
	if (!context) {
		throw new Error('useToc must be used within TocProvider');
	}
	return context;
}
