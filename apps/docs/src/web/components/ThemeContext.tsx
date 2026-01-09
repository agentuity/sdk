import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
	theme: Theme;
	resolvedTheme: "light" | "dark";
	setTheme: (theme: Theme) => void;
	cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "theme-preference";

function getSystemTheme(): "light" | "dark" {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function getStoredTheme(): Theme {
	if (typeof window === "undefined") return "system";
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === "light" || stored === "dark" || stored === "system") {
		return stored;
	}
	return "system";
}

function applyTheme(resolved: "light" | "dark") {
	const root = document.documentElement;
	if (resolved === "dark") {
		root.classList.add("dark");
	} else {
		root.classList.remove("dark");
	}
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(getStoredTheme);
	const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
		const stored = getStoredTheme();
		return stored === "system" ? getSystemTheme() : stored;
	});

	// Apply theme on mount and when it changes
	useEffect(() => {
		const resolved = theme === "system" ? getSystemTheme() : theme;
		setResolvedTheme(resolved);
		applyTheme(resolved);
		localStorage.setItem(STORAGE_KEY, theme);
	}, [theme]);

	// Listen for system theme changes
	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = () => {
			if (theme === "system") {
				const resolved = getSystemTheme();
				setResolvedTheme(resolved);
				applyTheme(resolved);
			}
		};
		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, [theme]);

	const setTheme = useCallback((newTheme: Theme) => {
		setThemeState(newTheme);
	}, []);

	// Cycle: light → dark → system → light
	const cycleTheme = useCallback(() => {
		setThemeState((current) => {
			if (current === "light") return "dark";
			if (current === "dark") return "system";
			return "light";
		});
	}, []);

	return (
		<ThemeContext.Provider
			value={{ theme, resolvedTheme, setTheme, cycleTheme }}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
