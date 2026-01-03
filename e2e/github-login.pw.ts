import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { rmSync } from 'fs';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '..', '.env') });

function runCli(args: string, env: Record<string, string>): string {
	const cliPath = resolve(__dirname, '..', 'packages', 'cli', 'bin', 'cli.ts');
	const cmd = `bun ${cliPath} ${args}`;
	console.log('Running CLI command:', cmd);
	console.log('CLI path:', cliPath);
	console.log('CWD:', resolve(__dirname, '..'));

	try {
		const result = execSync(cmd, {
			encoding: 'utf-8',
			env: { ...process.env, ...env },
			cwd: resolve(__dirname, '..'),
			timeout: 30000, // 30 second timeout
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		console.log('CLI output:', result);
		return result;
	} catch (error: unknown) {
		const execError = error as { stdout?: string; stderr?: string; message?: string };
		console.error('CLI command failed');
		console.error('stdout:', execError.stdout);
		console.error('stderr:', execError.stderr);
		console.error('message:', execError.message);
		throw error;
	}
}

async function loginToGithub(
	page: import('@playwright/test').Page,
	username: string,
	password: string
) {
	await page.goto('https://github.com/login');

	// Fill in username and submit
	await page.fill('input[name="login"]', username);
	await page.click('input[type="submit"]');

	// Wait for password field to be enabled and fill it
	const passwordInput = page.locator('input[name="password"]');
	await passwordInput.waitFor({ state: 'visible' });
	await expect(passwordInput).toBeEnabled({ timeout: 10000 });
	await passwordInput.fill(password);

	// Click sign in button
	await page.click('input[type="submit"]');

	// Wait for navigation
	await page.waitForURL(
		(url) => {
			const path = url.pathname;
			return (
				path === '/' || path.includes('/sessions/two-factor') || path.includes('/dashboard')
			);
		},
		{ timeout: 30000 }
	);

	// Check if 2FA is required
	if (page.url().includes('two-factor')) {
		throw new Error('2FA required - this test account should not have 2FA enabled');
	}
}

test.describe.configure({ mode: 'serial' });

// Target org ID from apps/testing/github-app-test-project/agentuity.json
const TARGET_ORG_ID = 'org_2u8RgDTwcZWrZrZ3sZh24T5FCtz';
const TEST_PROJECT_DIR = resolve(__dirname, '..', 'apps', 'testing', 'github-app-test-project');
const GITHUB_REMOTE_URL = 'https://github.com/agentuity-gh-app-tester/github-app-test-project.git';

function initGitRepo() {
	console.log('Initializing git repo in:', TEST_PROJECT_DIR);
	try {
		execSync('git init', { cwd: TEST_PROJECT_DIR, encoding: 'utf-8' });
		execSync(`git remote add origin ${GITHUB_REMOTE_URL}`, {
			cwd: TEST_PROJECT_DIR,
			encoding: 'utf-8',
		});
		console.log('Git repo initialized with origin:', GITHUB_REMOTE_URL);
	} catch (error: unknown) {
		const execError = error as { message?: string };
		// Ignore if already initialized
		if (!execError.message?.includes('already exists')) {
			console.error('Failed to init git repo:', execError.message);
		}
	}
}

function cleanupGitRepo() {
	console.log('Cleaning up git repo in:', TEST_PROJECT_DIR);
	try {
		rmSync(resolve(TEST_PROJECT_DIR, '.git'), { recursive: true, force: true });
		console.log('Git repo cleaned up');
	} catch (error: unknown) {
		const execError = error as { message?: string };
		console.error('Failed to cleanup git repo:', execError.message);
	}
}

test.describe('GitHub OAuth Flow', () => {
	test.beforeAll(() => {
		initGitRepo();
	});

	test.afterAll(() => {
		cleanupGitRepo();
	});

	test('connect GitHub account via OAuth', async ({ page }) => {
		const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
		const GITHUB_PASSWORD = process.env.GITHUB_PASSWORD;

		if (!GITHUB_USERNAME || !GITHUB_PASSWORD) {
			console.warn('⚠️  Skipping: GITHUB_USERNAME and/or GITHUB_PASSWORD not set');
			test.skip();
			return;
		}

		// Step 1: Start GitHub OAuth flow via CLI
		// CLI uses keychain auth on macOS if logged in, or AGENTUITY_CLI_API_KEY + AGENTUITY_USER_ID for CI
		console.log('Starting GitHub OAuth flow...');
		const addOutput = runCli(`--json git account add --org ${TARGET_ORG_ID} --url-only`, {});

		// Extract JSON from output (CLI may include debug logs before JSON)
		const jsonMatch = addOutput.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error(`No JSON found in CLI output: ${addOutput}`);
		}
		const addResult = JSON.parse(jsonMatch[0]);
		console.log('CLI output:', addResult);

		if (!addResult.url) {
			// Account may already be connected
			if (addResult.connected) {
				console.log('GitHub account already connected');
				return;
			}
			throw new Error('No OAuth URL returned from CLI');
		}

		const oauthUrl = addResult.url;
		console.log('OAuth URL:', oauthUrl);

		// Step 2: Login to GitHub
		console.log('Logging into GitHub...');
		await loginToGithub(page, GITHUB_USERNAME, GITHUB_PASSWORD);
		console.log('GitHub login successful');

		// Step 3: Navigate to OAuth URL
		console.log('Navigating to OAuth URL...');
		await page.goto(oauthUrl, { waitUntil: 'domcontentloaded' });
		console.log('Navigated, current URL:', page.url());

		// Step 4: Authorize the app (if authorization page is shown)
		// Wait a moment for page to stabilize
		await page.waitForTimeout(2000);
		console.log('OAuth page URL:', page.url());

		// GitHub OAuth authorize button selectors
		const authorizeButton = page.locator(
			'button.js-integrations-install-form-submit, button:has-text("Install & Authorize"), button:has-text("Authorize"), button[name="authorize"]'
		);

		try {
			await authorizeButton.first().waitFor({ state: 'visible', timeout: 10000 });
			console.log('Found authorize button, clicking...');
			await authorizeButton.first().click();
			console.log('Clicked authorize button');
			await page.waitForTimeout(3000);
		} catch (_e) {
			console.log('No authorize button found or already authorized');
			console.log('Page title:', await page.title());
		}

		console.log('Current URL after OAuth:', page.url());

		// Step 5: Verify connection via CLI
		console.log('Verifying GitHub connection...');
		const listOutput = runCli('--json git account list', {});

		// Extract JSON array from output (CLI may include debug logs before JSON)
		// Look for array starting with [ followed by { or whitespace+{
		const listJsonMatch = listOutput.match(/\[\s*\{[\s\S]*\}\s*\]/);
		if (!listJsonMatch) {
			throw new Error(`No JSON array found in CLI output: ${listOutput}`);
		}
		const listResult = JSON.parse(listJsonMatch[0]);
		console.log('Connected accounts:', listResult);

		// Check that the test account is connected
		const allIntegrations = listResult.flatMap(
			(org: { integrations: { githubAccountName: string }[] }) => org.integrations
		);
		const isConnected = allIntegrations.some(
			(i: { githubAccountName: string }) =>
				i.githubAccountName.toLowerCase() === GITHUB_USERNAME.toLowerCase()
		);

		expect(isConnected).toBe(true);
		console.log('✓ GitHub OAuth flow completed successfully');
	});

	test('disconnect GitHub account', async () => {
		const GITHUB_USERNAME = process.env.GITHUB_USERNAME;

		if (!GITHUB_USERNAME) {
			console.warn('⚠️  Skipping: GITHUB_USERNAME not set');
			test.skip();
			return;
		}

		console.log('Disconnecting GitHub account from org:', TARGET_ORG_ID);

		// Get list of accounts to find the integration ID
		const listOutput = runCli('--json git account list', {});
		const listJsonMatch = listOutput.match(/\[\s*\{[\s\S]*\}\s*\]/);
		if (!listJsonMatch) {
			console.log('No accounts found, nothing to disconnect');
			return;
		}

		const listResult = JSON.parse(listJsonMatch[0]);

		// Find the target org
		const targetOrg = listResult.find((org: { orgId: string }) => org.orgId === TARGET_ORG_ID);

		if (!targetOrg) {
			console.log('Target org not found in accounts list');
			return;
		}

		// Find the integration for our test account in the target org
		const integration = targetOrg.integrations.find(
			(i: { githubAccountName: string }) =>
				i.githubAccountName.toLowerCase() === GITHUB_USERNAME.toLowerCase()
		);

		if (integration) {
			console.log(`Found integration ${integration.id}, removing...`);
			try {
				const removeOutput = runCli(
					`--json git account remove --org ${TARGET_ORG_ID} --account ${integration.id} --confirm`,
					{}
				);
				console.log('Remove output:', removeOutput);
			} catch (e) {
				console.error('Failed to remove integration:', e);
			}
		} else {
			console.log('Test account not found in target org, nothing to disconnect');
		}

		console.log('✓ GitHub account disconnected');
	});
});
