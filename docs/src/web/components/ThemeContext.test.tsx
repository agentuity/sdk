import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider, useTheme } from './ThemeContext';

// Surfaces the theme context values as attributes so the server render can be
// compared byte-for-byte against the client's first (hydration) render.
function ThemeProbe() {
	const { theme, resolvedTheme } = useTheme();
	return <span data-theme={theme} data-resolved-theme={resolvedTheme} />;
}

// Emulates a browser whose visitor has explicitly chosen a non-default theme.
// The real SSR server has no window/localStorage/matchMedia, so getStoredTheme()
// returns 'system' and getSystemTheme() returns 'dark' there.
function withStoredPreference(stored: string, prefersDark: boolean, run: () => void) {
	const g = globalThis as Record<string, unknown>;
	g.window = globalThis;
	g.localStorage = { getItem: () => stored, setItem: () => {}, removeItem: () => {} };
	g.matchMedia = () => ({
		matches: prefersDark,
		addEventListener: () => {},
		removeEventListener: () => {},
	});
	try {
		run();
	} finally {
		delete g.window;
		delete g.localStorage;
		delete g.matchMedia;
	}
}

function renderProbe(): string {
	return renderToStaticMarkup(
		<ThemeProvider>
			<ThemeProbe />
		</ThemeProvider>
	);
}

// Regression: a stored Light/Dark preference must not make the first client
// render diverge from the server render. If it does, React throws away the
// server-rendered DOM and regenerates the tree on the client, which is the
// full-page flash on hard refresh (React #418).
test('first client render matches server render when Dark is stored (no hydration flash)', () => {
	const serverHtml = renderProbe();

	let clientHtml = '';
	withStoredPreference('dark', false, () => {
		clientHtml = renderProbe();
	});

	expect(clientHtml).toBe(serverHtml);
});

test('first client render matches server render when Light is stored (no hydration flash)', () => {
	const serverHtml = renderProbe();

	let clientHtml = '';
	withStoredPreference('light', true, () => {
		clientHtml = renderProbe();
	});

	expect(clientHtml).toBe(serverHtml);
});
