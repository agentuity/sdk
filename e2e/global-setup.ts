/**
 * Global setup for Playwright E2E tests.
 *
 * This runs once before all tests and ensures the dev server is fully ready.
 * The webServer config only waits for a response, but we need to ensure
 * Vite has finished compiling the frontend assets.
 */

const MAX_RETRIES = 30;
const RETRY_DELAY = 1000;

async function globalSetup(): Promise<void> {
	console.log('[Global Setup] Waiting for dev server to be fully ready...');

	const baseURL = process.env.BASE_URL || 'http://localhost:3500';

	// Wait for the server to respond with actual content (not just 200 OK)
	for (let i = 0; i < MAX_RETRIES; i++) {
		try {
			console.log(`[Global Setup] Attempt ${i + 1}/${MAX_RETRIES}: Checking ${baseURL}`);

			const response = await fetch(baseURL, {
				signal: AbortSignal.timeout(5000),
			});

			const html = await response.text();

			// Check if the response contains the expected HTML structure
			// If Vite isn't ready, we'll get an HTML page without the proper script tags loaded
			if (html.includes('<div id="root">') && html.includes('frontend.tsx')) {
				console.log('[Global Setup] ✓ Server is ready with frontend assets');

				// Now verify Vite can serve a module by checking @vite/client
				try {
					const viteCheck = await fetch(`${baseURL}/@vite/client`, {
						signal: AbortSignal.timeout(5000),
					});
					if (viteCheck.ok) {
						console.log('[Global Setup] ✓ Vite assets are being served correctly');
						return;
					}
					console.log(
						`[Global Setup] Vite client returned ${viteCheck.status}, waiting...`
					);
				} catch (viteErr) {
					console.log(
						`[Global Setup] Vite client check failed: ${viteErr instanceof Error ? viteErr.message : String(viteErr)}`
					);
				}
			} else {
				console.log(
					`[Global Setup] Server responded but content not ready yet (${html.length} bytes)`
				);
			}
		} catch (err) {
			console.log(
				`[Global Setup] Request failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}

		await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
	}

	throw new Error(
		`Dev server did not become ready after ${MAX_RETRIES} attempts (${MAX_RETRIES * RETRY_DELAY}ms)`
	);
}

export default globalSetup;
