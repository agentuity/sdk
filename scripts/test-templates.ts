#!/usr/bin/env bun
/**
 * Template Integration Test Script
 *
 * This script tests all templates by:
 * 1. Creating a project from each template
 * 2. Installing dependencies from npm registry
 * 3. Building the project
 * 4. Running typecheck
 * 5. Starting the server and testing endpoints
 * 6. Checking for outdated dependencies (report-only)
 *
 * Usage:
 *   bun scripts/test-templates.ts              # Test all templates
 *   bun scripts/test-templates.ts --template default  # Test specific template
 *   bun scripts/test-templates.ts --list       # List available templates
 *   bun scripts/test-templates.ts --help       # Show help
 */

import { spawn, type Subprocess } from 'bun';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Colors for output
const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const BLUE = '\x1b[0;34m';
const CYAN = '\x1b[0;36m';
const NC = '\x1b[0m'; // No Color

function logInfo(msg: string) {
	console.log(`${BLUE}[INFO]${NC} ${msg}`);
}

function logSuccess(msg: string) {
	console.log(`${GREEN}[PASS]${NC} ${msg}`);
}

function logError(msg: string) {
	console.log(`${RED}[FAIL]${NC} ${msg}`);
}

function logWarning(msg: string) {
	console.log(`${YELLOW}[WARN]${NC} ${msg}`);
}

function logStep(msg: string) {
	console.log(`${CYAN}[STEP]${NC} ${msg}`);
}

interface TemplateInfo {
	id: string;
	name: string;
	description: string;
	directory: string;
}

interface TemplatesManifest {
	templates: TemplateInfo[];
}

interface TestResult {
	template: string;
	passed: boolean;
	steps: {
		name: string;
		passed: boolean;
		error?: string;
		duration?: number;
	}[];
	duration: number;
}

// Parse command line arguments
function parseArgs(): { template?: string; list: boolean; help: boolean; skipOutdated: boolean } {
	const args = process.argv.slice(2);
	let template: string | undefined;
	let list = false;
	let help = false;
	let skipOutdated = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--template' || arg === '-t') {
			template = args[++i];
		} else if (arg === '--list' || arg === '-l') {
			list = true;
		} else if (arg === '--help' || arg === '-h') {
			help = true;
		} else if (arg === '--skip-outdated') {
			skipOutdated = true;
		}
	}

	return { template, list, help, skipOutdated };
}

function showHelp() {
	console.log(`
Template Integration Test Script

Usage:
  bun scripts/test-templates.ts [options]

Options:
  --template, -t <id>   Test a specific template by ID
  --list, -l            List all available templates
  --skip-outdated       Skip outdated dependency check
  --help, -h            Show this help message

Examples:
  bun scripts/test-templates.ts                    # Test all templates
  bun scripts/test-templates.ts --template default # Test only the default template
  bun scripts/test-templates.ts --list             # List available templates
`);
}

async function loadTemplates(sdkRoot: string): Promise<TemplateInfo[]> {
	const manifestPath = join(sdkRoot, 'templates', 'templates.json');
	const file = Bun.file(manifestPath);

	if (!(await file.exists())) {
		throw new Error(`templates.json not found at ${manifestPath}`);
	}

	const manifest = (await file.json()) as TemplatesManifest;
	return manifest.templates;
}

async function runCommand(
	cmd: string[],
	cwd: string,
	env?: Record<string, string>,
	timeout = 120000
): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
	const proc = spawn({
		cmd,
		cwd,
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => {
			proc.kill();
			reject(new Error(`Command timed out after ${timeout}ms: ${cmd.join(' ')}`));
		}, timeout);
	});

	try {
		const [exitCode, stdout, stderr] = await Promise.race([
			Promise.all([
				proc.exited,
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
			]),
			timeoutPromise,
		]);

		return {
			success: exitCode === 0,
			stdout,
			stderr,
			exitCode,
		};
	} catch (error) {
		return {
			success: false,
			stdout: '',
			stderr: error instanceof Error ? error.message : String(error),
			exitCode: -1,
		};
	}
}


async function createProject(
	sdkRoot: string,
	template: TemplateInfo,
	projectDir: string
): Promise<{ success: boolean; error?: string }> {
	const cliPath = join(sdkRoot, 'packages/cli/bin/cli.ts');
	const configPath = join(sdkRoot, 'packages/cli/examples/noauth-profile.yaml');
	const templateDir = join(sdkRoot, 'templates');

	const result = await runCommand(
		[
			'bun',
			cliPath,
			'--config',
			configPath,
			'create',
			'--name',
			`test-${template.id}`,
			'--template',
			template.id,
			'--template-dir',
			templateDir,
			'--no-register',
			'--no-install',
			'--no-build',
			'--confirm',
		],
		projectDir,
		{ AGENTUITY_SKIP_VERSION_CHECK: '1' },
		60000
	);

	if (!result.success) {
		return { success: false, error: result.stderr || result.stdout };
	}

	return { success: true };
}

async function installDependencies(
	projectDir: string
): Promise<{ success: boolean; error?: string }> {
	// Install dependencies from npm registry
	const installResult = await runCommand(['bun', 'install'], projectDir, undefined, 180000);
	if (!installResult.success) {
		return { success: false, error: installResult.stderr };
	}

	return { success: true };
}

async function buildProject(projectDir: string): Promise<{ success: boolean; error?: string }> {
	const result = await runCommand(['bun', 'run', 'build'], projectDir, undefined, 120000);
	if (!result.success) {
		return { success: false, error: result.stderr || result.stdout };
	}

	// Verify build output exists
	const agentuityDir = join(projectDir, '.agentuity');
	if (!existsSync(agentuityDir)) {
		return { success: false, error: 'Build output directory (.agentuity) not found' };
	}

	return { success: true };
}

async function typecheckProject(projectDir: string): Promise<{ success: boolean; error?: string }> {
	const result = await runCommand(['bunx', 'tsc', '--noEmit'], projectDir, undefined, 60000);
	if (!result.success) {
		return { success: false, error: result.stderr || result.stdout };
	}
	return { success: true };
}

async function startServer(
	projectDir: string,
	port: number,
	env: Record<string, string>
): Promise<{ proc: Subprocess; success: boolean; error?: string }> {
	const appPath = join(projectDir, '.agentuity', 'app.js');

	// The runtime reads port from PORT or AGENTUITY_PORT environment variables
	const proc = spawn({
		cmd: ['bun', 'run', appPath],
		cwd: projectDir,
		env: { ...process.env, ...env, PORT: String(port) },
		stdout: 'pipe',
		stderr: 'pipe',
	});

	// Wait for server to be ready
	const maxAttempts = 30;
	for (let i = 0; i < maxAttempts; i++) {
		await new Promise((resolve) => setTimeout(resolve, 1000));

		try {
			const response = await fetch(`http://127.0.0.1:${port}/_health`);
			if (response.ok) {
				return { proc, success: true };
			}
		} catch {
			// Server not ready yet
		}

		// Check if process crashed
		if (proc.exitCode !== null) {
			const stderr = await new Response(proc.stderr).text();
			return { proc, success: false, error: `Server crashed: ${stderr}` };
		}
	}

	proc.kill();
	return { proc, success: false, error: 'Server failed to start within 30 seconds' };
}

async function testEndpoints(
	port: number,
	template: TemplateInfo
): Promise<{ health: boolean; index: boolean; api: boolean; errors: string[] }> {
	const errors: string[] = [];
	let health = false;
	let index = false;
	let api = false;

	// Test health endpoint
	try {
		const response = await fetch(`http://127.0.0.1:${port}/_health`);
		health = response.ok;
		if (!health) {
			errors.push(`Health endpoint returned ${response.status}`);
		}
	} catch (e) {
		errors.push(`Health endpoint failed: ${e}`);
	}

	// Test index route
	try {
		const response = await fetch(`http://127.0.0.1:${port}/`);
		const text = await response.text();
		index = response.ok && text.includes('<');
		if (!index) {
			errors.push(`Index route returned ${response.status} or invalid HTML`);
		}
	} catch (e) {
		errors.push(`Index route failed: ${e}`);
	}

	// Test API route only for templates that don't require external API keys
	const safeTemplates = ['default', 'tailwind'];
	if (safeTemplates.includes(template.id)) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/api/hello`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Test' }),
			});
			const text = await response.text();
			api = response.ok && text.includes('Hello');
			if (!api) {
				errors.push(`API route returned ${response.status}: ${text.substring(0, 200)}`);
			}
		} catch (e) {
			errors.push(`API route failed: ${e}`);
		}
	} else {
		// Skip API test for templates requiring external API keys
		api = true; // Mark as passed (skipped)
	}

	return { health, index, api, errors };
}

async function checkOutdatedDependencies(projectDir: string): Promise<string[]> {
	const result = await runCommand(['bun', 'outdated'], projectDir, undefined, 30000);
	// bun outdated returns non-zero if there are outdated packages, but we just want to report
	const lines = result.stdout
		.split('\n')
		.filter((line) => line.trim() && !line.includes('@agentuity'));
	return lines;
}

async function testTemplate(
	sdkRoot: string,
	template: TemplateInfo,
	basePort: number,
	skipOutdated: boolean
): Promise<TestResult> {
	const startTime = Date.now();
	const result: TestResult = {
		template: template.id,
		passed: true,
		steps: [],
		duration: 0,
	};

	const tempDir = join(tmpdir(), `agentuity-test-${template.id}-${Date.now()}`);
	mkdirSync(tempDir, { recursive: true });

	let serverProc: Subprocess | null = null;

	try {
		console.log('');
		console.log(`${'='.repeat(60)}`);
		logInfo(`Testing template: ${template.name} (${template.id})`);
		console.log(`${'='.repeat(60)}`);

		// Step 1: Create project
		logStep('Creating project...');
		let stepStart = Date.now();
		const createResult = await createProject(sdkRoot, template, tempDir);
		result.steps.push({
			name: 'Create project',
			passed: createResult.success,
			error: createResult.error,
			duration: Date.now() - stepStart,
		});
		if (!createResult.success) {
			result.passed = false;
			logError(`Failed to create project: ${createResult.error}`);
			return result;
		}
		logSuccess('Project created');

		const projectDir = join(tempDir, `test-${template.id}`);

		// Step 2: Install dependencies
		logStep('Installing dependencies...');
		stepStart = Date.now();
		const installResult = await installDependencies(projectDir);
		result.steps.push({
			name: 'Install dependencies',
			passed: installResult.success,
			error: installResult.error,
			duration: Date.now() - stepStart,
		});
		if (!installResult.success) {
			result.passed = false;
			logError(`Failed to install dependencies: ${installResult.error}`);
			return result;
		}
		logSuccess('Dependencies installed');

		// Step 3: Build project
		logStep('Building project...');
		stepStart = Date.now();
		const buildResult = await buildProject(projectDir);
		result.steps.push({
			name: 'Build project',
			passed: buildResult.success,
			error: buildResult.error,
			duration: Date.now() - stepStart,
		});
		if (!buildResult.success) {
			result.passed = false;
			logError(`Failed to build project: ${buildResult.error}`);
			return result;
		}
		logSuccess('Project built');

		// Step 4: Typecheck
		logStep('Running typecheck...');
		stepStart = Date.now();
		const typecheckResult = await typecheckProject(projectDir);
		result.steps.push({
			name: 'Typecheck',
			passed: typecheckResult.success,
			error: typecheckResult.error,
			duration: Date.now() - stepStart,
		});
		if (!typecheckResult.success) {
			result.passed = false;
			logError(`Typecheck failed: ${typecheckResult.error}`);
			return result;
		}
		logSuccess('Typecheck passed');

		// Step 5: Start server and test endpoints
		logStep('Starting server...');
		stepStart = Date.now();

		// Set dummy API keys for templates that require them (to prevent crash on import)
		const serverEnv: Record<string, string> = {
			AGENTUITY_SDK_KEY: 'test-key',
			AGENTUITY_LOG_LEVEL: 'error',
		};

		// Add dummy provider keys to prevent SDK initialization failures
		if (template.id === 'openai' || template.id === 'vercel-openai') {
			serverEnv.OPENAI_API_KEY = 'sk-dummy-key-for-testing';
		} else if (template.id === 'groq') {
			serverEnv.GROQ_API_KEY = 'gsk-dummy-key-for-testing';
		} else if (template.id === 'xai') {
			serverEnv.XAI_API_KEY = 'xai-dummy-key-for-testing';
		}

		const serverResult = await startServer(projectDir, basePort, serverEnv);
		serverProc = serverResult.proc;

		result.steps.push({
			name: 'Start server',
			passed: serverResult.success,
			error: serverResult.error,
			duration: Date.now() - stepStart,
		});

		if (!serverResult.success) {
			result.passed = false;
			logError(`Failed to start server: ${serverResult.error}`);
			return result;
		}
		logSuccess('Server started');

		// Step 6: Test endpoints
		logStep('Testing endpoints...');
		stepStart = Date.now();
		const endpointResults = await testEndpoints(basePort, template);

		const endpointsPassed =
			endpointResults.health && endpointResults.index && endpointResults.api;
		result.steps.push({
			name: 'Test endpoints',
			passed: endpointsPassed,
			error: endpointResults.errors.length > 0 ? endpointResults.errors.join('; ') : undefined,
			duration: Date.now() - stepStart,
		});

		if (!endpointsPassed) {
			result.passed = false;
			logError(`Endpoint tests failed: ${endpointResults.errors.join('; ')}`);
		} else {
			logSuccess('Endpoint tests passed');
		}

		// Step 7: Check outdated dependencies (report-only)
		if (!skipOutdated) {
			logStep('Checking for outdated dependencies...');
			const outdated = await checkOutdatedDependencies(projectDir);
			if (outdated.length > 0) {
				logWarning('Outdated dependencies found (non-fatal):');
				for (const line of outdated.slice(0, 10)) {
					console.log(`  ${line}`);
				}
				if (outdated.length > 10) {
					console.log(`  ... and ${outdated.length - 10} more`);
				}
			} else {
				logSuccess('No outdated dependencies');
			}
		}
	} finally {
		// Cleanup
		if (serverProc) {
			serverProc.kill();
		}
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	}

	result.duration = Date.now() - startTime;
	return result;
}

async function main() {
	const args = parseArgs();

	if (args.help) {
		showHelp();
		process.exit(0);
	}

	const sdkRoot = resolve(join(import.meta.dir, '..'));
	const templates = await loadTemplates(sdkRoot);

	if (args.list) {
		console.log('\nAvailable templates:');
		for (const template of templates) {
			console.log(`  ${CYAN}${template.id}${NC} - ${template.name}`);
			console.log(`    ${template.description}`);
		}
		process.exit(0);
	}

	// Filter templates if specific one requested
	let templatesToTest = templates;
	if (args.template) {
		const found = templates.find((t) => t.id === args.template);
		if (!found) {
			logError(`Template '${args.template}' not found. Use --list to see available templates.`);
			process.exit(1);
		}
		templatesToTest = [found];
	}

	console.log('');
	console.log(`${'='.repeat(60)}`);
	console.log(`${CYAN}Agentuity Template Integration Tests${NC}`);
	console.log(`${'='.repeat(60)}`);
	console.log(`Templates to test: ${templatesToTest.map((t) => t.id).join(', ')}`);

	// Test templates in parallel (each uses a different port)
	const basePort = 3500;

	const testPromises = templatesToTest.map((template, i) => {
		const port = basePort + i; // Use different ports for each template
		return testTemplate(sdkRoot, template, port, args.skipOutdated);
	});

	const results = await Promise.all(testPromises);

	// Print summary
	console.log('');
	console.log(`${'='.repeat(60)}`);
	console.log(`${CYAN}Test Summary${NC}`);
	console.log(`${'='.repeat(60)}`);

	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;

	for (const result of results) {
		const status = result.passed ? `${GREEN}PASS${NC}` : `${RED}FAIL${NC}`;
		const duration = (result.duration / 1000).toFixed(1);
		console.log(`  ${status} ${result.template} (${duration}s)`);

		if (!result.passed) {
			for (const step of result.steps) {
				if (!step.passed) {
					console.log(`    ${RED}Failed step:${NC} ${step.name}`);
					if (step.error) {
						console.log(`    ${RED}Error:${NC} ${step.error.substring(0, 200)}`);
					}
				}
			}
		}
	}

	console.log('');
	console.log(
		`Total: ${results.length} | Passed: ${GREEN}${passed}${NC} | Failed: ${RED}${failed}${NC}`
	);
	console.log('');

	if (failed > 0) {
		process.exit(1);
	}
}

main().catch((error) => {
	logError(`Unexpected error: ${error}`);
	process.exit(1);
});
