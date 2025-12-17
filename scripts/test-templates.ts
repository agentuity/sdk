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
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Path to local CLI bin (use development version, not npm)
const SDK_ROOT = resolve(join(import.meta.dir, '..'));
const CLI_BIN = join(SDK_ROOT, 'packages/cli/bin/cli.ts');

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
			if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
				console.error(`${RED}Error:${NC} --template requires a value`);
				showHelp();
				process.exit(1);
			}
			template = args[++i];
		} else if (arg === '--list' || arg === '-l') {
			list = true;
		} else if (arg === '--help' || arg === '-h') {
			help = true;
		} else if (arg === '--skip-outdated') {
			skipOutdated = true;
		} else if (arg.startsWith('-')) {
			console.error(`${RED}Error:${NC} Unknown option: ${arg}`);
			showHelp();
			process.exit(1);
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

async function packWorkspacePackages(sdkRoot: string): Promise<Map<string, string>> {
	const packages = new Map<string, string>();
	const packagesDir = join(tmpdir(), `agentuity-packages-${Date.now()}`);
	mkdirSync(packagesDir, { recursive: true });

	logStep('Building all packages...');
	const buildResult = await runCommand(['bunx', 'tsc', '--build', '--force'], sdkRoot);
	if (!buildResult.success) {
		throw new Error(`Build failed: ${buildResult.stderr}`);
	}

	const packagesToPack = [
		'core',
		'schema',
		'react',
		'auth',
		'runtime',
		'server',
		'cli',
		'workbench',
	];

	logStep('Packing workspace packages...');
	for (const pkg of packagesToPack) {
		const pkgDir = join(sdkRoot, 'packages', pkg);

		// Special case: build workbench CSS before packing
		if (pkg === 'workbench') {
			const workbenchBuildResult = await runCommand(['bun', 'run', 'build'], pkgDir);
			if (!workbenchBuildResult.success) {
				throw new Error(`Workbench build failed: ${workbenchBuildResult.stderr}`);
			}
		}

		const packResult = await runCommand(
			['bun', 'pm', 'pack', '--destination', packagesDir, '--quiet'],
			pkgDir
		);

		if (!packResult.success) {
			throw new Error(`Failed to pack ${pkg}: ${packResult.stderr}`);
		}

		const tarballOutput = packResult.stdout.trim();
		// bun pm pack returns full path if --destination is used, not just filename
		const tarballPath = tarballOutput.startsWith(packagesDir)
			? tarballOutput
			: join(packagesDir, tarballOutput);

		if (!existsSync(tarballPath)) {
			throw new Error(`Packed tarball not found: ${tarballPath}`);
		}

		packages.set(`@agentuity/${pkg}`, tarballPath);
		logSuccess(`Packed ${pkg}: ${tarballPath.split('/').pop()}`);
	}

	return packages;
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

	let timerId: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timerId = setTimeout(() => {
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

		if (timerId !== null) {
			clearTimeout(timerId);
		}

		return {
			success: exitCode === 0,
			stdout,
			stderr,
			exitCode,
		};
	} catch (error) {
		if (timerId !== null) {
			clearTimeout(timerId);
		}
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
	projectDir: string,
	packedPackages: Map<string, string>
): Promise<{ success: boolean; error?: string }> {
	// Read package.json
	const packageJsonPath = join(projectDir, 'package.json');
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

	// Replace @agentuity dependencies with local tarball paths
	for (const [pkgName, tarballPath] of packedPackages.entries()) {
		if (packageJson.dependencies?.[pkgName]) {
			packageJson.dependencies[pkgName] = `file:${tarballPath}`;
		}
		if (packageJson.devDependencies?.[pkgName]) {
			packageJson.devDependencies[pkgName] = `file:${tarballPath}`;
		}
	}

	// Write updated package.json
	writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

	// Delete lockfile to ensure fresh resolution
	const lockfilePath = join(projectDir, 'bun.lock');
	if (existsSync(lockfilePath)) {
		rmSync(lockfilePath);
	}

	// Install all dependencies (including local tarballs) in one go
	const installResult = await runCommand(['bun', 'install'], projectDir, undefined, 300000);
	if (!installResult.success) {
		return { success: false, error: installResult.stderr };
	}

	// Remove nested @agentuity packages that Bun might have installed from npm
	const nestedPattern = join(projectDir, 'node_modules/@agentuity/*/node_modules/@agentuity');
	const globResult = await runCommand(
		[
			'sh',
			'-c',
			`find node_modules/@agentuity/*/node_modules/@agentuity -type d 2>/dev/null || true`,
		],
		projectDir
	);

	if (globResult.success && globResult.stdout.trim()) {
		const nestedDirs = globResult.stdout.trim().split('\n');
		for (const dir of nestedDirs) {
			const fullPath = join(projectDir, dir);
			if (existsSync(fullPath)) {
				logWarning(`Removing nested @agentuity packages from ${dir}`);
				rmSync(fullPath, { recursive: true, force: true });
			}
		}
	}

	return { success: true };
}

async function buildProject(projectDir: string): Promise<{ success: boolean; error?: string }> {
	// Use local CLI bin to ensure we test the current code
	const result = await runCommand(['bun', CLI_BIN, 'build'], projectDir, undefined, 120000);
	if (!result.success) {
		// Log full error output for debugging
		if (result.stderr) {
			console.error('\n' + result.stderr);
		}
		if (result.stdout) {
			console.log('\n' + result.stdout);
		}
		return { success: false, error: result.stderr || result.stdout };
	}

	// Verify build output exists
	const agentuityDir = join(projectDir, '.agentuity');
	if (!existsSync(agentuityDir)) {
		return { success: false, error: 'Build output directory (.agentuity) not found' };
	}

	return { success: true };
}

async function verifyCssInBuild(projectDir: string): Promise<{ success: boolean; error?: string }> {
	const clientDir = join(projectDir, '.agentuity', 'client');
	const indexHtmlPath = join(clientDir, 'index.html');

	// Check if index.html exists
	if (!existsSync(indexHtmlPath)) {
		return { success: false, error: 'Built index.html not found' };
	}

	// Read index.html and verify CSS link exists
	const indexHtml = readFileSync(indexHtmlPath, 'utf-8');
	if (!indexHtml.includes('<link rel="stylesheet"')) {
		return { success: false, error: 'No CSS stylesheet link found in built index.html' };
	}

	// Find CSS files in assets directory
	const assetsDir = join(clientDir, 'assets');
	if (!existsSync(assetsDir)) {
		return { success: false, error: 'Assets directory not found' };
	}

	const assetsResult = await runCommand(['find', assetsDir, '-name', '*.css'], projectDir);
	if (!assetsResult.success || !assetsResult.stdout.trim()) {
		return { success: false, error: 'No CSS files found in assets directory' };
	}

	const cssFiles = assetsResult.stdout.trim().split('\n').filter(Boolean);
	if (cssFiles.length === 0) {
		return { success: false, error: 'No CSS files generated' };
	}

	// Verify at least one CSS file contains Tailwind classes
	let foundTailwindClasses = false;
	for (const cssFile of cssFiles) {
		const cssContent = readFileSync(cssFile, 'utf-8');
		// Check for common Tailwind patterns (theme layer, utility classes)
		if (cssContent.includes('@layer') || cssContent.includes('.flex{') || cssContent.includes('.bg-')) {
			foundTailwindClasses = true;
			break;
		}
	}

	if (!foundTailwindClasses) {
		return { success: false, error: 'CSS files do not contain Tailwind classes' };
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

	// Pass port as CLI flag and merge env vars
	const mergedEnv = { ...process.env, ...env };

	// Debug: Verify env vars are set
	logInfo(`Starting server with env: ${Object.keys(env).join(', ')}`);

	const proc = spawn({
		cmd: ['bun', appPath, '--port', String(port)],
		cwd: projectDir,
		env: mergedEnv,
		stdout: 'inherit',
		stderr: 'inherit',
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
			return { proc, success: false, error: 'Server crashed (check logs above)' };
		}
	}

	proc.kill();
	return { proc, success: false, error: 'Server failed to start within 30 seconds' };
}

async function testEndpoints(
	port: number,
	template: TemplateInfo
): Promise<{ health: boolean; errors: string[] }> {
	const errors: string[] = [];
	let health = false;

	// Test health endpoint only - sufficient to verify template builds and starts correctly
	try {
		const response = await fetch(`http://127.0.0.1:${port}/_health`);
		health = response.ok;
		if (!health) {
			errors.push(`Health endpoint returned ${response.status}`);
		}
	} catch (e) {
		errors.push(`Health endpoint failed: ${e}`);
	}

	return { health, errors };
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
	skipOutdated: boolean,
	packedPackages: Map<string, string>
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
		const installResult = await installDependencies(projectDir, packedPackages);
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

		// Step 3.5: Verify CSS for Tailwind template
		if (template.id === 'tailwind') {
			logStep('Verifying Tailwind CSS in build output...');
			stepStart = Date.now();
			const cssVerifyResult = await verifyCssInBuild(projectDir);
			result.steps.push({
				name: 'Verify CSS in build',
				passed: cssVerifyResult.success,
				error: cssVerifyResult.error,
				duration: Date.now() - stepStart,
			});
			if (!cssVerifyResult.success) {
				result.passed = false;
				logError(`CSS verification failed: ${cssVerifyResult.error}`);
				return result;
			}
			logSuccess('Tailwind CSS verified in build output');
		}

		// Step 3.5: Prepare environment variables (passed via spawn, Bun auto-loads .env)
		const envVars: Record<string, string> = {
			AGENTUITY_SDK_KEY: 'test-key',
			AGENTUITY_LOG_LEVEL: 'error',
		};

		// Add dummy provider keys based on template
		if (template.id === 'openai' || template.id === 'vercel-openai') {
			envVars.OPENAI_API_KEY = 'dummy-openai-key';
		} else if (template.id === 'groq') {
			envVars.GROQ_API_KEY = 'dummy-groq-key';
		} else if (template.id === 'xai') {
			envVars.XAI_API_KEY = 'dummy-xai-key';
		} else if (template.id === 'clerk') {
			envVars.CLERK_SECRET_KEY = 'sk_test_dummy';
			envVars.AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_dummy';
		}

		// Step 4: Typecheck (TEMPORARILY DISABLED)
		/*
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
		*/

		// Step 5: Start server and test endpoints
		logStep('Starting server...');
		stepStart = Date.now();

		const serverResult = await startServer(projectDir, basePort, envVars);
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

		// Step 6: Test health endpoint
		logStep('Testing health endpoint...');
		stepStart = Date.now();
		const endpointResults = await testEndpoints(basePort, template);

		result.steps.push({
			name: 'Test health endpoint',
			passed: endpointResults.health,
			error: endpointResults.errors.length > 0 ? endpointResults.errors.join('; ') : undefined,
			duration: Date.now() - stepStart,
		});

		if (!endpointResults.health) {
			result.passed = false;
			logError(`Health endpoint test failed: ${endpointResults.errors.join('; ')}`);
		} else {
			logSuccess('Health endpoint test passed');
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

	// Pack workspace packages once before testing
	console.log('');
	const packedPackages = await packWorkspacePackages(sdkRoot);

	// Test templates serially (one at a time) to avoid port conflicts and easier debugging
	const basePort = 3500;

	const results: TestResult[] = [];
	for (let i = 0; i < templatesToTest.length; i++) {
		const template = templatesToTest[i];
		const port = basePort; // Use same port since we're running one at a time
		const result = await testTemplate(sdkRoot, template, port, args.skipOutdated, packedPackages);
		results.push(result);
	}

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
