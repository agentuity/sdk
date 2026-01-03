import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env from project root if it exists
const envPath = resolve(__dirname, '.env');
if (existsSync(envPath)) {
	const content = readFileSync(envPath, 'utf-8');
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIndex = trimmed.indexOf('=');
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex);
		const value = trimmed.slice(eqIndex + 1).replace(/^["']|["']$/g, '');
		if (!process.env[key]) process.env[key] = value;
	}
}

export default defineConfig({
	globalSetup: './e2e/global-setup.ts',
	testDir: './e2e',
	testMatch: '**/*.pw.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL: 'http://localhost:3500',
		trace: 'on-first-retry',
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
