'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from 'react';

type RegionCode = 'usw' | 'usc' | 'use';

interface RegionOption {
	code: RegionCode;
	name: string;
}

interface RegionContextValue {
	region: RegionCode;
	setRegion: (region: RegionCode) => void;
	baseUrl: string;
	regions: RegionOption[];
}

const REGION_STORAGE_KEY = 'agentuity-docs-api-region';
const VALID_REGION_CODES = new Set<string>(['usw', 'usc', 'use']);

const REGION_OPTIONS: RegionOption[] = [
	{ code: 'usw', name: 'US West' },
	{ code: 'usc', name: 'US Central' },
	{ code: 'use', name: 'US East' },
];

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({ children }: { children: ReactNode }) {
	const [region, setRegionState] = useState<RegionCode>('usw');

	useEffect(() => {
		try {
			const stored = localStorage.getItem(REGION_STORAGE_KEY);
			if (stored && VALID_REGION_CODES.has(stored)) {
				setRegionState(stored as RegionCode);
			}
		} catch {
			// localStorage may be unavailable in some environments
		}
	}, []);

	const setRegion = useCallback(
		(nextRegion: RegionCode) => {
			setRegionState(nextRegion);
			try {
				localStorage.setItem(REGION_STORAGE_KEY, nextRegion);
			} catch {
				// localStorage may be unavailable in some environments
			}
		},
		[setRegionState]
	);

	const value = useMemo<RegionContextValue>(
		() => ({
			region,
			setRegion,
			baseUrl: `https://catalyst-${region}.agentuity.cloud`,
			regions: REGION_OPTIONS,
		}),
		[region, setRegion]
	);

	return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
	const context = useContext(RegionContext);
	if (!context) {
		throw new Error('useRegion must be used within RegionProvider');
	}

	return context;
}
