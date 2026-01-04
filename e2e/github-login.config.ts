import { defineConfig, devices } from '@playwright/test';

// Standalone config for GitHub OAuth test - no webServer needed
export default defineConfig({
	testDir: './',
	testMatch: 'github-login.pw.ts',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: 1,
	reporter: 'list',
	timeout: 120000,
	use: {
		headless: process.env.CI ? true : false,
		trace: 'on-first-retry',
		viewport: { width: 1280, height: 720 },
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	// No webServer - this test only uses CLI and external URLs
});
