import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { rmSync } from 'fs';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '..', '.env') });

// Test configuration

const GH_TEST_ACC_REPO = process.env.GH_TEST_ACC_REPO;
if (!GH_TEST_ACC_REPO) {
	throw new Error('GH_TEST_ACC_REPO is not set');
}
const TEST_PROJECT_DIR = resolve(__dirname, '..', 'apps', 'testing', GH_TEST_ACC_REPO);
if (!TEST_PROJECT_DIR) {
	throw new Error('TEST_PROJECT_DIR is not set');
}

const TARGET_ORG_ID = process.env.GH_TEST_TARGET_ORG_ID;
if (!TARGET_ORG_ID) {
	throw new Error('GH_TEST_TARGET_ORG_ID is not set');
}

// Environment variables
const GH_TEST_ACC_USERNAME = process.env.GH_TEST_ACC_USERNAME;
const GH_TEST_ACC_PASSWORD = process.env.GH_TEST_ACC_PASSWORD;
const GH_TEST_ACC_TOKEN = process.env.GH_TEST_ACC_TOKEN;

// Derived values
const GITHUB_REPO_FULL_NAME = GH_TEST_ACC_USERNAME
	? `${GH_TEST_ACC_USERNAME}/${GH_TEST_ACC_REPO}`
	: undefined;
const GITHUB_REMOTE_URL = GITHUB_REPO_FULL_NAME
	? `https://github.com/${GITHUB_REPO_FULL_NAME}.git`
	: undefined;

interface Integration {
	id: string;
	githubAccountName: string;
	githubAccountType: string;
}

interface OrgAccount {
	orgId: string;
	integrations: Integration[];
}

function runCli(args: string): string {
	const cliPath = resolve(__dirname, '..', 'packages', 'cli', 'bin', 'cli.ts');
	const cmd = `bun ${cliPath} ${args}`;
	console.log('Running:', cmd);

	try {
		const result = execSync(cmd, {
			encoding: 'utf-8',
			env: process.env,
			cwd: TEST_PROJECT_DIR,
			timeout: 60000,
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		console.log('Output:', result);
		return result;
	} catch (error: unknown) {
		const execError = error as { stdout?: string; stderr?: string; message?: string };
		console.error('CLI failed:', execError.message);
		console.error('stdout:', execError.stdout);
		console.error('stderr:', execError.stderr);
		throw error;
	}
}

function parseJsonOutput(output: string): unknown {
	// Find JSON start - look for array `[\n` or `[{` or object `{\n` or `{"`
	const patterns = [
		{ pattern: /\[\s*\{/, type: 'array' },
		{ pattern: /\[\s*\]/, type: 'array' },
		{ pattern: /\{\s*"/, type: 'object' },
	];

	let jsonStart = -1;
	for (const { pattern } of patterns) {
		const match = output.match(pattern);
		if (match && match.index !== undefined) {
			if (jsonStart === -1 || match.index < jsonStart) {
				jsonStart = match.index;
			}
		}
	}

	if (jsonStart === -1) {
		throw new Error(`No JSON found in output: ${output}`);
	}

	const jsonStr = output.slice(jsonStart);
	return JSON.parse(jsonStr);
}

async function loginToGithub(
	page: import('@playwright/test').Page,
	username: string,
	password: string
) {
	await page.goto('https://github.com/login');

	await page.fill('input[name="login"]', username);
	await page.click('input[type="submit"]');

	const passwordInput = page.locator('input[name="password"]');
	await passwordInput.waitFor({ state: 'visible' });
	await expect(passwordInput).toBeEnabled({ timeout: 10000 });
	await passwordInput.fill(password);

	await page.click('input[type="submit"]');

	await page.waitForURL(
		(url) => {
			const path = url.pathname;
			return (
				path === '/' || path.includes('/sessions/two-factor') || path.includes('/dashboard')
			);
		},
		{ timeout: 30000 }
	);

	if (page.url().includes('two-factor')) {
		throw new Error('2FA required - test account should not have 2FA enabled');
	}
}

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

function findTestAccountIntegration(accounts: OrgAccount[]): Integration | null {
	if (!GH_TEST_ACC_USERNAME) return null;

	const targetOrg = accounts.find((org) => org.orgId === TARGET_ORG_ID);
	if (!targetOrg) return null;

	return (
		targetOrg.integrations.find(
			(i) => i.githubAccountName.toLowerCase() === GH_TEST_ACC_USERNAME.toLowerCase()
		) ?? null
	);
}

// GitHub API helpers for push/revert tests
interface GitHubFileContent {
	sha: string;
	content: string;
}

async function githubApi(
	method: string,
	endpoint: string,
	body?: Record<string, unknown>
): Promise<unknown> {
	if (!GH_TEST_ACC_TOKEN) throw new Error('GITHUB_TEST_ACC_TOKEN not set');

	const response = await fetch(`https://api.github.com${endpoint}`, {
		method,
		headers: {
			Authorization: `Bearer ${GH_TEST_ACC_TOKEN}`,
			Accept: 'application/vnd.github.v3+json',
			'Content-Type': 'application/json',
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`GitHub API error: ${response.status} ${error}`);
	}

	return response.json();
}

async function getFileContent(path: string): Promise<GitHubFileContent> {
	const result = (await githubApi(
		'GET',
		`/repos/${GITHUB_REPO_FULL_NAME}/contents/${path}`
	)) as GitHubFileContent;
	return result;
}

async function updateFile(
	path: string,
	content: string,
	message: string,
	sha: string
): Promise<{ commit: { sha: string } }> {
	const result = (await githubApi('PUT', `/repos/${GITHUB_REPO_FULL_NAME}/contents/${path}`, {
		message,
		content: Buffer.from(content).toString('base64'),
		sha,
		branch: 'main',
	})) as { commit: { sha: string } };
	return result;
}

// ============================================================================
// Tests run in serial mode to maintain state
// ============================================================================

test.describe.configure({ mode: 'serial' });

test.describe('GitHub App Integration', () => {
	test.beforeAll(() => {
		initGitRepo();
	});

	test.afterAll(() => {
		cleanupGitRepo();
	});

	// --------------------------------------------------------------------------
	// 1. Account Management
	// --------------------------------------------------------------------------

	test('1.1 connect GitHub account via OAuth', async ({ page }) => {
		if (!GH_TEST_ACC_USERNAME || !GH_TEST_ACC_PASSWORD) {
			console.warn('⚠️  Skipping: GITHUB_TEST_ACC_USERNAME/PASSWORD not set');
			test.skip();
			return;
		}

		console.log('Starting GitHub OAuth flow...');
		const addOutput = runCli(`--json git account add --org ${TARGET_ORG_ID} --url-only`);
		const addResult = parseJsonOutput(addOutput) as { url?: string; connected?: boolean };

		if (!addResult.url) {
			if (addResult.connected) {
				console.log('GitHub account already connected');
				return;
			}
			throw new Error('No OAuth URL returned from CLI');
		}

		console.log('Logging into GitHub...');
		await loginToGithub(page, GH_TEST_ACC_USERNAME, GH_TEST_ACC_PASSWORD);

		console.log('Navigating to OAuth URL...');
		await page.goto(addResult.url, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Authorize if needed
		const authorizeButton = page.locator(
			'button.js-integrations-install-form-submit, button:has-text("Install & Authorize"), button:has-text("Authorize"), button[name="authorize"]'
		);

		try {
			await authorizeButton.first().waitFor({ state: 'visible', timeout: 10000 });
			await authorizeButton.first().click();
			await page.waitForTimeout(3000);
		} catch {
			console.log('No authorize button found or already authorized');
		}

		// Verify connection
		const listOutput = runCli('--json git account list');
		const accounts = parseJsonOutput(listOutput) as OrgAccount[];
		const integration = findTestAccountIntegration(accounts);

		expect(integration).not.toBeNull();
		console.log('✓ GitHub account connected');
	});

	test('1.2 list connected accounts', async () => {
		if (!GH_TEST_ACC_USERNAME) {
			test.skip();
			return;
		}

		const listOutput = runCli('--json git account list');
		const accounts = parseJsonOutput(listOutput) as OrgAccount[];

		expect(Array.isArray(accounts)).toBe(true);

		const integration = findTestAccountIntegration(accounts);
		expect(integration).not.toBeNull();
		expect(integration!.githubAccountName.toLowerCase()).toBe(GH_TEST_ACC_USERNAME.toLowerCase());
		expect(['user', 'org']).toContain(integration!.githubAccountType);

		console.log('✓ Listed connected accounts');
	});

	// --------------------------------------------------------------------------
	// 2. Repository Operations
	// --------------------------------------------------------------------------

	test('2.1 list accessible repositories', async () => {
		if (!GH_TEST_ACC_USERNAME) {
			test.skip();
			return;
		}

		// Get the test account's integration ID to avoid interactive prompt
		const accountsOutput = runCli('--json git account list');
		const accounts = parseJsonOutput(accountsOutput) as OrgAccount[];
		const integration = findTestAccountIntegration(accounts);
		expect(integration).not.toBeNull();

		const listOutput = runCli(
			`--json git list --org ${TARGET_ORG_ID} --account ${integration!.id}`
		);
		const repos = parseJsonOutput(listOutput) as {
			fullName: string;
			defaultBranch: string;
			private: boolean;
		}[];

		expect(Array.isArray(repos)).toBe(true);
		expect(repos.length).toBeGreaterThan(0);

		// Verify test repo is accessible
		const testRepo = repos.find((r) => r.fullName === GITHUB_REPO_FULL_NAME);
		expect(testRepo).toBeDefined();
		expect(testRepo!.defaultBranch).toBeDefined();

		console.log(`✓ Listed ${repos.length} repositories`);
	});

	test('2.2 link project to repository with --detect', async () => {
		if (!GH_TEST_ACC_USERNAME) {
			test.skip();
			return;
		}

		// Use --detect to auto-detect repo from git origin
		const linkOutput = runCli('--json git link --detect --confirm');
		const linkResult = parseJsonOutput(linkOutput) as {
			linked: boolean;
			repoFullName?: string;
			branch?: string;
		};

		expect(linkResult.linked).toBe(true);
		expect(linkResult.repoFullName).toBe(GITHUB_REPO_FULL_NAME);

		console.log(`✓ Linked to ${linkResult.repoFullName} (branch: ${linkResult.branch})`);
	});

	test('2.3 git status shows linked repository', async () => {
		if (!GH_TEST_ACC_USERNAME) {
			test.skip();
			return;
		}

		const statusOutput = runCli('--json git status');
		const status = parseJsonOutput(statusOutput) as {
			orgId: string;
			connected: boolean;
			integrations: Integration[];
			projectId: string;
			linked: boolean;
			repoFullName?: string;
			branch?: string;
			autoDeploy?: boolean;
			previewDeploy?: boolean;
		};

		expect(status.connected).toBe(true);
		expect(status.integrations.length).toBeGreaterThan(0);
		expect(status.linked).toBe(true);
		expect(status.repoFullName).toBe(GITHUB_REPO_FULL_NAME);
		expect(status.branch).toBeDefined();
		expect(status.autoDeploy).toBe(true);
		expect(status.previewDeploy).toBe(true);

		console.log('✓ Git status verified');
	});

	test('2.4 unlink project from repository', async () => {
		if (!GH_TEST_ACC_USERNAME) {
			test.skip();
			return;
		}

		const unlinkOutput = runCli('--json git unlink --confirm');
		const unlinkResult = parseJsonOutput(unlinkOutput) as {
			unlinked: boolean;
			repoFullName?: string;
		};

		expect(unlinkResult.unlinked).toBe(true);

		// Verify unlinked
		const statusOutput = runCli('--json git status');
		const status = parseJsonOutput(statusOutput) as { linked: boolean };

		expect(status.linked).toBe(false);

		console.log('✓ Project unlinked');
	});

	test('2.5 link with explicit repo and custom settings', async () => {
		if (!GH_TEST_ACC_USERNAME) {
			test.skip();
			return;
		}

		// Link with auto-deploy disabled
		const linkOutput = runCli(
			`--json git link --repo ${GITHUB_REPO_FULL_NAME} --branch main --deploy false --preview false --confirm`
		);
		const linkResult = parseJsonOutput(linkOutput) as { linked: boolean };

		expect(linkResult.linked).toBe(true);

		// Verify settings
		const statusOutput = runCli('--json git status');
		const status = parseJsonOutput(statusOutput) as {
			linked: boolean;
			autoDeploy?: boolean;
			previewDeploy?: boolean;
		};

		expect(status.linked).toBe(true);
		expect(status.autoDeploy).toBe(false);
		expect(status.previewDeploy).toBe(false);

		console.log('✓ Linked with custom settings (deploy disabled)');
	});

	test('2.6 re-link with different settings', async () => {
		if (!GH_TEST_ACC_USERNAME) {
			test.skip();
			return;
		}

		// Re-link with auto-deploy enabled
		const linkOutput = runCli(
			`--json git link --repo ${GITHUB_REPO_FULL_NAME} --branch main --deploy true --preview true --confirm`
		);
		const linkResult = parseJsonOutput(linkOutput) as { linked: boolean };

		expect(linkResult.linked).toBe(true);

		// Verify settings updated
		const statusOutput = runCli('--json git status');
		const status = parseJsonOutput(statusOutput) as {
			autoDeploy?: boolean;
			previewDeploy?: boolean;
		};

		expect(status.autoDeploy).toBe(true);
		expect(status.previewDeploy).toBe(true);

		console.log('✓ Re-linked with updated settings');
	});

	test('2.7 push commit via GitHub API and revert', async () => {
		if (!GH_TEST_ACC_USERNAME || !GH_TEST_ACC_TOKEN) {
			console.warn('⚠️  Skipping: GITHUB_TEST_ACC_TOKEN not set');
			test.skip();
			return;
		}

		const filePath = 'README.md';
		const testMarker = `\n<!-- test-commit-${Date.now()} -->`;

		// Get current file content
		console.log('Getting current README.md content...');
		const originalFile = await getFileContent(filePath);
		const originalContent = Buffer.from(originalFile.content, 'base64').toString('utf-8');
		console.log(`Original SHA: ${originalFile.sha}`);

		// Push a test commit (append marker)
		console.log('Pushing test commit...');
		const modifiedContent = originalContent + testMarker;
		const pushResult = await updateFile(
			filePath,
			modifiedContent,
			'test: add test marker for deployment trigger test',
			originalFile.sha
		);
		console.log(`Pushed commit: ${pushResult.commit.sha}`);

		// Wait briefly for any webhooks to fire
		await new Promise((r) => setTimeout(r, 2000));

		// Revert the commit (restore original content)
		console.log('Reverting test commit...');
		const modifiedFile = await getFileContent(filePath);
		const revertResult = await updateFile(
			filePath,
			originalContent,
			'test: revert test marker',
			modifiedFile.sha
		);
		console.log(`Reverted with commit: ${revertResult.commit.sha}`);

		// Verify content is restored
		const finalFile = await getFileContent(filePath);
		const finalContent = Buffer.from(finalFile.content, 'base64').toString('utf-8');
		expect(finalContent).toBe(originalContent);

		console.log('✓ Push and revert completed');
	});

	// --------------------------------------------------------------------------
	// 3. Cleanup - runs last
	// --------------------------------------------------------------------------

	test('3.1 unlink before disconnect', async () => {
		if (!GH_TEST_ACC_USERNAME) {
			test.skip();
			return;
		}

		try {
			runCli('--json git unlink --confirm');
		} catch {
			// May already be unlinked
		}

		console.log('✓ Project unlinked for cleanup');
	});

	test('3.2 disconnect GitHub account', async () => {
		if (!GH_TEST_ACC_USERNAME) {
			test.skip();
			return;
		}

		const listOutput = runCli('--json git account list');
		const accounts = parseJsonOutput(listOutput) as OrgAccount[];
		const integration = findTestAccountIntegration(accounts);

		if (!integration) {
			console.log('Test account not found, nothing to disconnect');
			return;
		}

		console.log(`Removing integration ${integration.id}...`);
		runCli(
			`--json git account remove --org ${TARGET_ORG_ID} --account ${integration.id} --confirm`
		);

		// Verify removed
		const verifyOutput = runCli('--json git account list');
		const verifyAccounts = parseJsonOutput(verifyOutput) as OrgAccount[];
		const stillConnected = findTestAccountIntegration(verifyAccounts);

		expect(stillConnected).toBeNull();

		console.log('✓ GitHub account disconnected');
	});
});
