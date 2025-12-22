/**
 * Global setup for Playwright E2E tests.
 *
 * This runs once before all tests and ensures the dev server is fully ready.
 * The webServer config only waits for a response, but we need to ensure
 * Vite has finished compiling the frontend assets AND the React app has rendered.
 */

const MAX_RETRIES = 60;
const RETRY_DELAY = 1000;

async function globalSetup(): Promise<void> {
	console.log('[Global Setup] Waiting for dev server to be fully ready...');

	const baseURL = process.env.BASE_URL || 'http://localhost:3500';

	for (let i = 0; i < MAX_RETRIES; i++) {
		try {
			console.log(`[Global Setup] Attempt ${i + 1}/${MAX_RETRIES}: Checking readiness...`);

			// Step 1: Check that the HTML page is served with expected content
			const htmlResponse = await fetch(baseURL, {
				signal: AbortSignal.timeout(5000),
			});
			const html = await htmlResponse.text();

			if (!html.includes('<div id="root">') || !html.includes('frontend.tsx')) {
				console.log(
					`[Global Setup] HTML not ready yet (has root: ${html.includes('<div id="root">')}, has frontend: ${html.includes('frontend.tsx')})`
				);
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
				continue;
			}
			console.log('[Global Setup] ✓ HTML page is ready');

			// Step 2: Verify @vite/client is accessible (Vite HMR infrastructure)
			const viteClientRes = await fetch(`${baseURL}/@vite/client`, {
				signal: AbortSignal.timeout(5000),
			});
			if (!viteClientRes.ok) {
				console.log(`[Global Setup] @vite/client returned ${viteClientRes.status}, waiting...`);
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
				continue;
			}
			console.log('[Global Setup] ✓ Vite client is ready');

			// Step 3: Verify the actual frontend.tsx module can be served (critical for React app)
			// This ensures Vite has compiled the user's application code
			const frontendRes = await fetch(`${baseURL}/src/web/frontend.tsx`, {
				signal: AbortSignal.timeout(10000),
			});
			if (!frontendRes.ok) {
				console.log(
					`[Global Setup] /src/web/frontend.tsx returned ${frontendRes.status}, waiting...`
				);
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
				continue;
			}

			// Verify it's actually JavaScript (not an error page)
			const contentType = frontendRes.headers.get('content-type') || '';
			if (!contentType.includes('javascript') && !contentType.includes('typescript')) {
				console.log(
					`[Global Setup] /src/web/frontend.tsx has wrong content-type: ${contentType}, waiting...`
				);
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
				continue;
			}
			console.log('[Global Setup] ✓ Frontend module is compiled and ready');

			// Step 4: Verify a route page works (tests client-side routing proxy)
			const streamsRes = await fetch(`${baseURL}/streams`, {
				signal: AbortSignal.timeout(5000),
			});
			if (!streamsRes.ok) {
				console.log(`[Global Setup] /streams returned ${streamsRes.status}, waiting...`);
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
				continue;
			}
			console.log('[Global Setup] ✓ Client-side routing is working');

			console.log('[Global Setup] ✓ All readiness checks passed!');
			return;
		} catch (err) {
			console.log(
				`[Global Setup] Request failed: ${err instanceof Error ? err.message : String(err)}`
			);
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
		}
	}

	throw new Error(
		`Dev server did not become ready after ${MAX_RETRIES} attempts (${MAX_RETRIES * RETRY_DELAY}ms)`
	);
}

export default globalSetup;
