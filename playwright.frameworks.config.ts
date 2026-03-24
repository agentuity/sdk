import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for testing framework integration demos.
 * Tests TanStack Start, Next.js, and Vite RSC apps with Agentuity integration.
 */
export default defineConfig({
	testDir: './e2e/frameworks',
	testMatch: '**/*.pw.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? Number(process.env.PLAYWRIGHT_WORKERS) || undefined : undefined, // Auto-detect based on CPUs, or override via PLAYWRIGHT_WORKERS
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
		{
			name: 'vite-rsc',
			testMatch: 'vite-rsc.pw.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:3002',
			},
		},
	],
});
