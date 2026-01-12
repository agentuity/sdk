import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for testing framework integration demos.
 * Tests TanStack Start and Next.js apps with Agentuity integration.
 */
export default defineConfig({
	testDir: './e2e/frameworks',
	testMatch: '**/*.pw.ts',
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
			testMatch: 'tanstack.pw.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:3000',
			},
		},
		{
			name: 'nextjs',
			testMatch: 'nextjs.pw.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:3001',
			},
		},
	],
});
