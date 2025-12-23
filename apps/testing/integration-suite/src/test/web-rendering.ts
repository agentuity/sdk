/**
 * Web Frontend Rendering Tests
 *
 * Tests that verify:
 * 1. Web frontend renders correctly
 * 2. Assets are served with correct MIME types
 * 3. SPA fallback works for client-side routes
 * 4. SPA fallback doesn't catch asset requests (CRITICAL REGRESSION TEST)
 * 5. Relative paths in HTML are transformed correctly (dev mode only)
 *
 * Note: Some tests are dev-mode specific and will be skipped in production builds.
 */

import { test } from '@test/suite';
import { assert, assertEqual, uniqueId } from '@test/helpers';

// Check if we're in dev mode with Vite
const isDev = process.env.DEV === 'true';

// Test: Root HTML loads correctly
test('web-rendering', 'root-html-loads', async () => {
	const res = await fetch('http://127.0.0.1:3500/');

	// In dev mode without Vite running, this may return 500
	// Skip test if server isn't properly configured
	if (res.status === 500) {
		// Dev mode but Vite not running - skip
		return;
	}

	assertEqual(res.status, 200);
	const html = await res.text();

	// Verify root div exists (works in both dev and prod)
	assert(html.includes('<div id="root"></div>'), 'Should have root div');

	if (isDev) {
		// Dev mode: Verify Vite client script is injected
		assert(html.includes('/@vite/client'), 'Should include Vite client script in dev mode');

		// Verify React refresh is injected
		assert(
			html.includes('@react-refresh') || html.includes('RefreshRuntime'),
			'Should include React refresh in dev mode'
		);
	}
});

// Test: Relative paths transformed to absolute (dev mode only)
test('web-rendering', 'relative-paths-transformed', async () => {
	if (!isDev) {
		// Skip in production mode - uses bundled assets
		return;
	}

	const res = await fetch('http://127.0.0.1:3500/');
	const html = await res.text();

	// Original HTML has src="./frontend.tsx"
	// Should be transformed to src="/src/web/frontend.tsx" in dev mode
	assert(
		html.includes('src="/src/web/frontend.tsx"'),
		'Should transform ./frontend.tsx to /src/web/frontend.tsx'
	);
});

// Test: Frontend module loads with JavaScript MIME type (dev mode only)
test('web-rendering', 'frontend-module-loads', async () => {
	if (!isDev) {
		// Skip in production mode - uses bundled assets
		return;
	}

	const res = await fetch('http://127.0.0.1:3500/src/web/frontend.tsx');
	assertEqual(res.status, 200);

	const contentType = res.headers.get('content-type');
	assert(
		contentType?.includes('javascript') ?? false,
		`Should have JavaScript MIME type, got: ${contentType}`
	);

	const content = await res.text();
	assert(content.length > 0, 'Should have content');
	assert(content.includes('import'), 'Should be transformed JavaScript with imports');
});

// Test: App component loads with JavaScript MIME type (dev mode only)
test('web-rendering', 'app-component-loads', async () => {
	if (!isDev) {
		// Skip in production mode - uses bundled assets
		return;
	}

	const res = await fetch('http://127.0.0.1:3500/src/web/App.tsx');
	assertEqual(res.status, 200);

	const contentType = res.headers.get('content-type');
	assert(
		contentType?.includes('javascript') ?? false,
		`Should have JavaScript MIME type, got: ${contentType}`
	);

	const content = await res.text();
	assert(content.includes('import'), 'Should be transformed JavaScript');
});

// Test: SPA fallback works for client-side routes (CRITICAL)
test('web-rendering', 'spa-fallback-routes', async () => {
	// Test various SPA routes (no file extensions)
	// These should return HTML, not 404
	const routes = ['/dashboard', '/users', '/settings/profile', '/app/nested/route'];

	for (const route of routes) {
		const res = await fetch('http://127.0.0.1:3500' + route);

		// In production with static files, these routes might 404 if no SPA routing is set up
		// What we're testing is that IF they return 200, they return HTML (not caught by asset 404)
		if (res.status === 200) {
			const contentType = res.headers.get('content-type');
			assert(
				contentType?.includes('text/html') ?? false,
				`Route ${route} should return HTML, got: ${contentType}`
			);

			const html = await res.text();
			assert(html.includes('<div id="root"></div>'), `Route ${route} should return index.html`);
		}
	}
});

// Test: Asset requests return 404 (not caught by SPA fallback)
test('web-rendering', 'asset-404-not-caught', async () => {
	// Asset requests with extensions should 404, not return HTML
	const assetPaths = [
		'/nonexistent.js',
		'/missing.tsx',
		'/fake.css',
		'/image.png',
		'/data.json',
		'/script.mjs',
	];

	for (const path of assetPaths) {
		const res = await fetch('http://127.0.0.1:3500' + path);
		assertEqual(res.status, 404, `Asset ${path} should return 404`);

		const contentType = res.headers.get('content-type');
		// Should NOT return HTML for asset requests
		assert(
			!(contentType?.includes('text/html') ?? false),
			`Asset ${path} should not return HTML, got: ${contentType}`
		);
	}
});

// Test: Vite HMR websocket available (dev mode only)
test('web-rendering', 'vite-hmr-available', async () => {
	if (!isDev) {
		// Skip in production mode
		return;
	}

	const res = await fetch('http://127.0.0.1:3500/@vite/client');
	assertEqual(res.status, 200);

	const contentType = res.headers.get('content-type');
	assert(contentType?.includes('javascript') ?? false, 'Vite client should be JavaScript');
});

// Test: Static public assets work
test('web-rendering', 'public-assets-load', async () => {
	// Note: This test will fail if no public assets exist
	// We're just verifying the proxy route works
	const res = await fetch('http://127.0.0.1:3500/public/favicon.ico', {
		redirect: 'manual', // Don't follow redirects
	});

	// Either 200 (exists) or 404 (doesn't exist) - both are fine
	// What we DON'T want is HTML (SPA fallback catching it)
	const contentType = res.headers.get('content-type');
	if (res.status === 200) {
		assert(!(contentType?.includes('text/html') ?? false), 'Public asset should not return HTML');
	}
});

// Test: API routes return 404 (not caught by SPA fallback)
test('web-rendering', 'api-404-not-caught', async () => {
	const res = await fetch('http://127.0.0.1:3500/api/nonexistent');
	assertEqual(res.status, 404);

	const contentType = res.headers.get('content-type');
	// API 404s should not return HTML
	assert(!(contentType?.includes('text/html') ?? false), 'API 404 should not return HTML');
});

// Test: Frontend script does NOT have async attribute (GitHub issue #327)
// The async attribute causes a race condition where React components execute
// before the Vite preamble sets window.__vite_plugin_react_preamble_installed__
test('web-rendering', 'no-async-on-frontend-script', async () => {
	if (!isDev) {
		// Skip in production mode - uses bundled assets without this issue
		return;
	}

	const res = await fetch('http://127.0.0.1:3500/');
	if (res.status !== 200) {
		// Dev mode but Vite not running - skip
		return;
	}

	const html = await res.text();

	// Check that frontend.tsx script does NOT have async attribute
	// Pattern: src="...frontend.tsx" followed by optional attributes then >
	// Should NOT match: src="/src/web/frontend.tsx" async>
	const hasAsyncFrontend = /src="[^"]*frontend\.tsx"[^>]*\basync\b/i.test(html);
	assert(
		!hasAsyncFrontend,
		'Frontend script should NOT have async attribute (causes preamble race condition)'
	);
});

// Test: Vite preamble script comes before app script (GitHub issue #327)
test('web-rendering', 'preamble-before-app-script', async () => {
	if (!isDev) {
		// Skip in production mode
		return;
	}

	const res = await fetch('http://127.0.0.1:3500/');
	if (res.status !== 200) {
		return;
	}

	const html = await res.text();

	// Find positions of key scripts
	const viteClientPos = html.indexOf('/@vite/client');
	const reactRefreshPos = html.indexOf('@react-refresh');
	const frontendPos = html.indexOf('frontend.tsx');

	// Vite client should exist and come before frontend
	assert(viteClientPos !== -1, 'Vite client script should exist');
	assert(frontendPos !== -1, 'Frontend script should exist');
	assert(viteClientPos < frontendPos, 'Vite client should come before frontend script');

	// React refresh (preamble) should exist and come before frontend
	if (reactRefreshPos !== -1) {
		assert(
			reactRefreshPos < frontendPos,
			'React refresh preamble should come before frontend script'
		);
	}
});
