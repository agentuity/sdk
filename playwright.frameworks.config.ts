import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for testing framework integration demos.
 * Tests TanStack Start, Next.js, and SvelteKit apps with Agentuity integration.
 *
 * Specs live colocated with each app under tests/frameworks/<app>/tests/e2e.pw.ts.
 */
export default defineConfig({
	testDir: './tests/frameworks',
	testMatch: '**/tests/e2e.pw.ts',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: 'html',
	timeout: 60000,
	use: {
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'tanstack',
			testMatch: 'tanstack-start/tests/e2e.pw.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:3000',
			},
		},
		{
			name: 'nextjs',
			testMatch: 'nextjs-app/tests/e2e.pw.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:3000',
			},
		},
		{
			name: 'svelte',
			testMatch: 'svelte-web/tests/e2e.pw.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:3000',
			},
		},
	],
});
