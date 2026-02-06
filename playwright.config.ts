import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	globalSetup: './e2e/global-setup.ts',
	globalTeardown: './e2e/global-teardown.ts',
	testDir: './e2e',
	testMatch: '**/*.pw.ts',
	testIgnore: ['**/frameworks/**'],
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 4 : undefined, // CI runner has 4 vCPUs, tests use unique room IDs so can run in parallel
	reporter: 'html',
	use: {
		baseURL: 'http://localhost:3500',
		trace: 'on-first-retry',
		permissions: ['camera', 'microphone'],
		launchOptions: {
			args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
		},
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		command: 'cd apps/testing/e2e-web && bun run dev',
		url: 'http://localhost:3500',
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
		stdout: 'pipe',
	},
});
