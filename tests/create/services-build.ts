#!/usr/bin/env bun

/**
 * Scaffolds every framework that supports service augments with all of
 * its available services, then runs the generated app's build script.
 *
 * Cases run in parallel so CI catches framework-specific drift without
 * serializing multiple full project installs/builds.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
	frameworkCatalog,
	type FrameworkScaffold,
} from '../../packages/cli/src/cmd/project/frameworks';
import {
	getServiceCatalog,
	resolveSelection,
	type ServiceAugment,
} from '../../packages/cli/src/cmd/project/services-catalog';
import { getVersion } from '../../packages/cli/src/version';

const MONOREPO_ROOT = resolve(import.meta.dir, '../..');
const TEST_DIR = join(tmpdir(), `agentuity-services-build-${Date.now()}`);
const PACKAGE_MANAGER = 'npm';

const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	cyan: '\x1b[36m',
	blue: '\x1b[34m',
};

function log(message: string, color = colors.reset): void {
	console.log(`${color}${message}${colors.reset}`);
}

function logStep(step: string): void {
	log(`\n━━━ ${step} ━━━`, colors.cyan);
}

function logSuccess(message: string): void {
	log(`✓ ${message}`, colors.green);
}

function logInfo(message: string): void {
	log(`ℹ ${message}`, colors.blue);
}

function logError(message: string): void {
	log(`✗ ${message}`, colors.red);
}

async function cleanup(): Promise<void> {
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true, force: true });
	}
}

interface RunOptions {
	cwd: string;
	env?: Record<string, string>;
	label: string;
}

async function run(cmd: string[], opts: RunOptions): Promise<boolean> {
	logInfo(`[${opts.label}] $ ${cmd.join(' ')}`);
	const proc = Bun.spawn(cmd, {
		cwd: opts.cwd,
		stdout: 'inherit',
		stderr: 'inherit',
		env: {
			...process.env,
			AGENTUITY_SKIP_VERSION_CHECK: '1',
			NEXT_TELEMETRY_DISABLED: '1',
			NUXT_TELEMETRY_DISABLED: '1',
			ASTRO_TELEMETRY_DISABLED: '1',
			...opts.env,
		},
	});
	return (await proc.exited) === 0;
}

function buildEnv(): Record<string, string> {
	return {
		DATABASE_URL: 'postgres://user:pass@localhost:5432/agentuity_test',
		AWS_ENDPOINT: 'https://agentuity.test',
		AWS_BUCKET: 'test-bucket',
		AWS_ACCESS_KEY_ID: 'test-access-key',
		AWS_SECRET_ACCESS_KEY: 'test-secret-key',
		AWS_REGION: 'auto',
		OPENAI_API_KEY: 'test-openai-key',
		OPENAI_BASE_URL: 'https://api.agentuity.test/v1',
	};
}

async function assertAgentuityVersions(projectPath: string, label: string): Promise<boolean> {
	const pkg = JSON.parse(await readFile(join(projectPath, 'package.json'), 'utf8')) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	const expected = getVersion();
	const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
	const mismatches = Object.entries(deps).filter(
		([name, version]) => name.startsWith('@agentuity/') && version !== expected
	);

	if (mismatches.length === 0) {
		logSuccess(`[${label}] All @agentuity/* packages are pinned to ${expected}`);
		return true;
	}

	for (const [name, version] of mismatches) {
		logError(`[${label}] ${name} is ${version}, expected ${expected}`);
	}
	return false;
}

interface FrameworkCase {
	framework: FrameworkScaffold;
	selectedServices: string[];
}

function getFrameworkCases(services: ServiceAugment[]): FrameworkCase[] {
	return frameworkCatalog
		.map((framework) => {
			const serviceIds = services
				.filter((service) => service.frameworks.includes(framework.slug as never))
				.map((service) => service.id);
			return {
				framework,
				selectedServices: resolveSelection(serviceIds, services)
					.filter((service) => service.frameworks.includes(framework.slug as never))
					.map((service) => service.id),
			};
		})
		.filter((entry) => entry.selectedServices.length > 0);
}

async function runFrameworkCase(testCase: FrameworkCase): Promise<boolean> {
	const { framework, selectedServices } = testCase;
	const label = framework.slug;
	const projectName = `services-${framework.slug}`;
	const projectPath = join(TEST_DIR, projectName);

	logStep(`${framework.name}: create with ${selectedServices.join(', ')}`);
	const created = await run(
		[
			'bun',
			join(MONOREPO_ROOT, 'packages/cli/src/main.ts'),
			'create',
			'--name',
			projectName,
			'--framework',
			framework.slug,
			'--services',
			selectedServices.join(','),
			'--package-manager',
			PACKAGE_MANAGER,
			'--confirm',
			'--no-register',
		],
		{ cwd: TEST_DIR, env: buildEnv(), label }
	);
	if (!created) return false;

	if (!(await assertAgentuityVersions(projectPath, label))) return false;

	logStep(`${framework.name}: build`);
	const built = await run([PACKAGE_MANAGER, 'run', 'build'], {
		cwd: projectPath,
		env: buildEnv(),
		label,
	});
	if (!built) return false;

	logSuccess(`[${label}] ${framework.name} build passed`);
	return true;
}

async function main(): Promise<void> {
	log('\n╔════════════════════════════════════════════════════╗', colors.cyan);
	log('║  Agentuity Service Augment Build Smoke Test       ║', colors.cyan);
	log('╚════════════════════════════════════════════════════╝', colors.cyan);

	await cleanup();
	mkdirSync(TEST_DIR, { recursive: true });

	const cases = getFrameworkCases(getServiceCatalog());
	logInfo(`Running ${cases.length} framework cases in parallel`);

	let results: boolean[] = [];
	try {
		results = await Promise.all(cases.map((testCase) => runFrameworkCase(testCase)));
	} finally {
		logStep('Cleanup');
		await cleanup();
	}

	const allPassed = results.every(Boolean);
	log('\n╔════════════════════════════════════════════════════╗', colors.cyan);
	if (allPassed) {
		log('║           ✓ ALL SERVICE BUILDS PASSED             ║', colors.green);
	} else {
		log('║           ✗ SERVICE BUILD TEST FAILED             ║', colors.red);
	}
	log('╚════════════════════════════════════════════════════╝', colors.cyan);

	process.exit(allPassed ? 0 : 1);
}

main().catch(async (error: unknown) => {
	logError(`\nUnexpected error: ${error instanceof Error ? error.stack : String(error)}`);
	await cleanup();
	process.exit(1);
});
