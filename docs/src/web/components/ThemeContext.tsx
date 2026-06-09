import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
	theme: Theme;
	resolvedTheme: 'light' | 'dark';
	setTheme: (theme: Theme) => void;
	cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'theme-preference';

function getSystemTheme(): 'light' | 'dark' {
	if (typeof window === 'undefined') return 'dark';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme {
	if (typeof window === 'undefined') return 'system';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark' || stored === 'system') {
		return stored;
	}
	return 'system';
}

function applyTheme(resolved: 'light' | 'dark') {
	const root = document.documentElement;
	if (resolved === 'dark') {
		root.classList.add('dark');
	} else {
		root.classList.remove('dark');
	}
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	// Initialize to the values the SSR server produces. The server has no
	// window, so getStoredTheme() returns 'system' and getSystemTheme() returns
	// 'dark'. Reading the real preference during the first client render would
	// diverge from the server HTML; React rejects the mismatch (#418) and
	// recovers by discarding the server-rendered DOM for that tree and
	// re-rendering it on the client — the flash on hard refresh. The persisted
	// preference is adopted after mount instead (React's two-pass pattern).
	const [theme, setThemeState] = useState<Theme>('system');
	const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

	// After hydration, adopt the persisted preference and resolve the system
	// theme. The inline bootstrap script in __root.tsx applies the Tailwind
	// `dark` class to <html> before paint, so page colors don't flash; only
	// resolvedTheme-driven UI (e.g. theme-image) reconciles after this runs.
	useEffect(() => {
		const stored = getStoredTheme();
		const resolved = stored === 'system' ? getSystemTheme() : stored;
		setThemeState(stored);
		setResolvedTheme(resolved);
		applyTheme(resolved);
	}, []);

	// Listen for system theme changes
	useEffect(() => {
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handleChange = () => {
			if (theme === 'system') {
				const resolved = getSystemTheme();
				setResolvedTheme(resolved);
				applyTheme(resolved);
			}
		};
		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	}, [theme]);

	// Persist + apply on explicit user action. Persisting lives here, not in an
	// effect, so the mount-time adoption above never clobbers the stored value.
	const setTheme = useCallback((newTheme: Theme) => {
		const resolved = newTheme === 'system' ? getSystemTheme() : newTheme;
		localStorage.setItem(STORAGE_KEY, newTheme);
		setThemeState(newTheme);
		setResolvedTheme(resolved);
		applyTheme(resolved);
	}, []);

	// Cycle: light → dark → system → light
	const cycleTheme = useCallback(() => {
		setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
	}, [theme, setTheme]);

	return (
		<ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, cycleTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used within a ThemeProvider');
	}
	return context;
}
