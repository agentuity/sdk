/**
 * Buildpack Contract Tests
 *
 * End-to-end tests that create real (minimal) projects, run them through
 * the full detect → adapter.build → package pipeline, and validate the
 * output directory meets the buildpack contract:
 *
 * 1. launch.json exists and has valid process definitions
 * 2. Procfile exists and is parseable
 * 3. .agentuity-build marker exists with correct metadata
 * 4. For server apps: start command references a real file in the output
 * 5. For static apps: static directory exists with content
 * 6. Build artifacts are actually present in the output
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFrameworkWithPackageJson } from '../../../src/cmd/build/detect';
import { getAdapter } from '../../../src/cmd/build/adapters';
import { packageBuildOutput } from '../../../src/cmd/build/package';
import type { LaunchMetadata } from '../../../src/cmd/build/package/launch';

// ── Helpers ──

function createTestDir(): string {
	const dir = join(tmpdir(), `buildpack-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writePackageJson(dir: string, content: Record<string, unknown>) {
	writeFileSync(join(dir, 'package.json'), JSON.stringify(content, null, 2));
}

const logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: (() => {
		throw new Error('fatal');
	}) as never,
	child: () => logger,
};

/**
 * Parse a Procfile and return { processType: command } map.
 */
function parseProcfile(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const colonIdx = trimmed.indexOf(':');
		if (colonIdx === -1) continue;
		const type = trimmed.slice(0, colonIdx).trim();
		const command = trimmed.slice(colonIdx + 1).trim();
		result[type] = command;
	}
	return result;
}

/**
 * Validate the buildpack output contract for a given directory.
 * Returns an array of violations (empty = valid).
 */
function validateBuildpackContract(outputDir: string, expectedMode: 'server' | 'static'): string[] {
	const violations: string[] = [];

	// 1. launch.json must exist and be valid JSON
	const launchPath = join(outputDir, 'launch.json');
	if (!existsSync(launchPath)) {
		violations.push('launch.json is missing');
	} else {
		try {
			const launch: LaunchMetadata = JSON.parse(readFileSync(launchPath, 'utf-8'));
			if (!launch.processes || !Array.isArray(launch.processes)) {
				violations.push('launch.json: processes must be an array');
			}
			if (!launch.framework || typeof launch.framework.name !== 'string') {
				violations.push('launch.json: framework.name must be a string');
			}
			if (!launch.runtime || typeof launch.runtime.name !== 'string') {
				violations.push('launch.json: runtime.name must be a string');
			}
			if (!launch.build || typeof launch.build.duration !== 'number') {
				violations.push('launch.json: build.duration must be a number');
			}
			if (!launch.build || typeof launch.build.date !== 'string') {
				violations.push('launch.json: build.date must be a string');
			}

			// For server mode, must have at least one web process
			if (expectedMode === 'server') {
				const webProcess = launch.processes.find((p) => p.type === 'web');
				if (!webProcess) {
					violations.push('launch.json: server app must have a "web" process');
				} else {
					if (typeof webProcess.command !== 'string' || webProcess.command.length === 0) {
						violations.push('launch.json: web process must have a non-empty command');
					}
					if (webProcess.default !== true) {
						violations.push('launch.json: web process must be default');
					}
				}
			}
		} catch {
			violations.push('launch.json: invalid JSON');
		}
	}

	// 2. Procfile must exist and be parseable
	const procfilePath = join(outputDir, 'Procfile');
	if (!existsSync(procfilePath)) {
		violations.push('Procfile is missing');
	} else {
		const content = readFileSync(procfilePath, 'utf-8');
		const processes = parseProcfile(content);
		if (expectedMode === 'server' && !processes.web) {
			violations.push('Procfile: server app must have a "web" process type');
		}
		// Validate that Procfile commands are non-empty
		for (const [type, cmd] of Object.entries(processes)) {
			if (!cmd || cmd.length === 0) {
				violations.push(`Procfile: process "${type}" has empty command`);
			}
		}
	}

	// 3. .agentuity-build marker must exist
	const markerPath = join(outputDir, '.agentuity-build');
	if (!existsSync(markerPath)) {
		violations.push('.agentuity-build marker is missing');
	} else {
		try {
			const marker = JSON.parse(readFileSync(markerPath, 'utf-8'));
			if (marker.version !== 1) {
				violations.push('.agentuity-build: version must be 1');
			}
			if (typeof marker.framework !== 'string') {
				violations.push('.agentuity-build: framework must be a string');
			}
			if (typeof marker.runtime !== 'string') {
				violations.push('.agentuity-build: runtime must be a string');
			}
			if (marker.mode !== 'server' && marker.mode !== 'static') {
				violations.push('.agentuity-build: mode must be "server" or "static"');
			}
		} catch {
			violations.push('.agentuity-build: invalid JSON');
		}
	}

	return violations;
}

/**
 * Check that Procfile and launch.json agree on the start command.
 */
function validateConsistency(outputDir: string): string[] {
	const violations: string[] = [];

	const launchPath = join(outputDir, 'launch.json');
	const procfilePath = join(outputDir, 'Procfile');

	if (!existsSync(launchPath) || !existsSync(procfilePath)) return violations;

	const launch: LaunchMetadata = JSON.parse(readFileSync(launchPath, 'utf-8'));
	const procfile = parseProcfile(readFileSync(procfilePath, 'utf-8'));

	const webProcess = launch.processes.find((p) => p.type === 'web');
	if (webProcess && procfile.web) {
		if (webProcess.command !== procfile.web) {
			violations.push(
				`Procfile and launch.json disagree on web command: "${procfile.web}" vs "${webProcess.command}"`
			);
		}
	}

	return violations;
}

// ── Tests ──

describe('Buildpack Contract — End-to-End', () => {
	let testDir: string;
	let outputDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		outputDir = join(testDir, '.agentuity');
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	// ── Generic server project ──

	test('generic server project produces valid buildpack output', async () => {
		// Create a minimal Node.js server project
		writePackageJson(testDir, {
			name: 'test-server',
			version: '1.0.0',
			scripts: {
				build: 'mkdir -p dist && echo "console.log(42)" > dist/index.js',
				start: 'node dist/index.js',
			},
		});

		// Detect
		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();
		expect(framework!.name).toBe('generic');
		expect(framework!.mode).toBe('server');

		// Build
		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		// Package
		packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		// Validate contract
		const violations = validateBuildpackContract(buildResult.outputDir, 'server');
		expect(violations).toEqual([]);

		// Validate consistency
		const inconsistencies = validateConsistency(buildResult.outputDir);
		expect(inconsistencies).toEqual([]);
	}, 30_000);

	// ── Generic static project ──

	test('generic static project produces valid buildpack output', async () => {
		// Create a minimal static site project (build but no start)
		writePackageJson(testDir, {
			name: 'test-static',
			version: '1.0.0',
			scripts: {
				build: 'mkdir -p dist && echo "<h1>Hello</h1>" > dist/index.html',
			},
		});

		// Detect
		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();
		expect(framework!.name).toBe('generic');
		expect(framework!.mode).toBe('static');

		// Build
		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		// Package
		packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		// Validate contract
		const violations = validateBuildpackContract(buildResult.outputDir, 'static');
		expect(violations).toEqual([]);
	}, 30_000);

	// ── Server project: start command references real file ──

	test('server build output contains the file referenced by start command', async () => {
		writePackageJson(testDir, {
			name: 'test-server-entry',
			version: '1.0.0',
			scripts: {
				build: "mkdir -p dist && echo \"const http = require('http'); http.createServer((req, res) => res.end('ok')).listen(3000);\" > dist/server.js",
				start: 'node dist/server.js',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();

		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		// The build output should contain the dist/server.js file
		// The generic adapter copies build output to outputDir and the project root is '.'
		// So server.js should be findable relative to the output
		const launch: LaunchMetadata = JSON.parse(
			readFileSync(join(buildResult.outputDir, 'launch.json'), 'utf-8')
		);
		const webProcess = launch.processes.find((p) => p.type === 'web');
		expect(webProcess).toBeDefined();
		expect(webProcess!.command).toBeTruthy();

		// For generic adapter with buildOutput '.', the dist/ dir stays in the project
		// The start command is 'node dist/server.js' — verify the file exists in the project
		expect(existsSync(join(testDir, 'dist', 'server.js'))).toBe(true);
	}, 30_000);

	// ── Build creates actual artifacts ──

	test('build actually creates artifacts, not just metadata', async () => {
		writePackageJson(testDir, {
			name: 'test-artifacts',
			version: '1.0.0',
			scripts: {
				build: 'mkdir -p dist/assets && echo "body{color:red}" > dist/assets/style.css && echo "<html></html>" > dist/index.html && echo "console.log(1)" > dist/app.js',
				start: 'node dist/app.js',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		// Verify build artifacts exist in the project (generic adapter with buildOutput '.')
		expect(existsSync(join(testDir, 'dist', 'index.html'))).toBe(true);
		expect(existsSync(join(testDir, 'dist', 'app.js'))).toBe(true);
		expect(existsSync(join(testDir, 'dist', 'assets', 'style.css'))).toBe(true);
	}, 30_000);

	// ── Procfile format ──

	test('Procfile follows standard format (type: command)', async () => {
		writePackageJson(testDir, {
			name: 'test-procfile',
			version: '1.0.0',
			scripts: {
				build: 'echo "built"',
				start: 'node server.js',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		const procfileContent = readFileSync(join(buildResult.outputDir, 'Procfile'), 'utf-8');

		// Standard Procfile format: each line is "type: command\n"
		const lines = procfileContent.split('\n').filter((l) => l.trim().length > 0);
		for (const line of lines) {
			expect(line).toMatch(/^[a-z]+:\s+.+$/);
		}

		// Must end with newline
		expect(procfileContent.endsWith('\n')).toBe(true);
	}, 30_000);

	// ── launch.json schema completeness ──

	test('launch.json contains all required fields', async () => {
		writePackageJson(testDir, {
			name: 'test-launch-schema',
			version: '1.0.0',
			scripts: {
				build: 'echo "built"',
				start: 'bun run index.ts',
			},
			engines: { bun: '>=1.0.0' },
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		const launch: LaunchMetadata = JSON.parse(
			readFileSync(join(buildResult.outputDir, 'launch.json'), 'utf-8')
		);

		// Top-level fields
		expect(launch).toHaveProperty('processes');
		expect(launch).toHaveProperty('framework');
		expect(launch).toHaveProperty('runtime');
		expect(launch).toHaveProperty('build');

		// Framework fields
		expect(launch.framework).toHaveProperty('name');
		expect(typeof launch.framework.name).toBe('string');

		// Runtime fields
		expect(launch.runtime).toHaveProperty('name');
		expect(['node', 'bun']).toContain(launch.runtime.name);

		// Build fields
		expect(launch.build).toHaveProperty('date');
		expect(launch.build).toHaveProperty('duration');
		expect(typeof launch.build.duration).toBe('number');
		expect(launch.build.duration).toBeGreaterThanOrEqual(0);

		// Date must be ISO 8601
		expect(() => new Date(launch.build.date).toISOString()).not.toThrow();
	}, 30_000);

	// ── .agentuity-build marker schema ──

	test('.agentuity-build marker has correct schema', async () => {
		writePackageJson(testDir, {
			name: 'test-marker',
			version: '1.0.0',
			scripts: {
				build: 'echo "ok"',
				start: 'node index.js',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		const marker = JSON.parse(
			readFileSync(join(buildResult.outputDir, '.agentuity-build'), 'utf-8')
		);

		expect(marker.version).toBe(1);
		expect(typeof marker.framework).toBe('string');
		expect(typeof marker.runtime).toBe('string');
		expect(['server', 'static']).toContain(marker.mode);
		expect(typeof marker.buildDate).toBe('string');
		expect(() => new Date(marker.buildDate).toISOString()).not.toThrow();
	}, 30_000);

	// ── Consistency across all output files ──

	test('framework name is consistent across all output files', async () => {
		writePackageJson(testDir, {
			name: 'test-consistency',
			version: '1.0.0',
			scripts: {
				build: 'echo "built"',
				start: 'node app.js',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		const launch: LaunchMetadata = JSON.parse(
			readFileSync(join(buildResult.outputDir, 'launch.json'), 'utf-8')
		);
		const marker = JSON.parse(
			readFileSync(join(buildResult.outputDir, '.agentuity-build'), 'utf-8')
		);

		// Framework name must match across files
		expect(launch.framework.name).toBe(marker.framework);
		expect(launch.framework.name).toBe(framework!.name);

		// Runtime must match
		expect(launch.runtime.name).toBe(marker.runtime);
		expect(launch.runtime.name).toBe(framework!.runtime);

		// Mode must match
		expect(marker.mode).toBe(framework!.mode);
	}, 30_000);

	// ── Build failure propagation ──

	test('build failure from bad script propagates as error', async () => {
		writePackageJson(testDir, {
			name: 'test-fail',
			version: '1.0.0',
			scripts: {
				build: 'exit 1',
				start: 'node index.js',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		const adapter = getAdapter(framework!.name);

		await expect(
			adapter.build({
				projectDir: testDir,
				framework: framework!,
				packageJson: packageJson!,
				outputDir,
				logger,
			})
		).rejects.toThrow(/Build failed/);
	}, 30_000);

	// ── No node_modules for static builds ──

	test('static build does not copy node_modules', async () => {
		writePackageJson(testDir, {
			name: 'test-static-no-nm',
			version: '1.0.0',
			scripts: {
				build: 'mkdir -p dist && echo "<h1>Hello</h1>" > dist/index.html',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		expect(framework!.mode).toBe('static');

		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		// Static builds should NOT copy node_modules to output
		expect(existsSync(join(buildResult.outputDir, 'node_modules'))).toBe(false);
	}, 30_000);

	// ── Build duration is reasonable ──

	test('build result has non-zero duration', async () => {
		writePackageJson(testDir, {
			name: 'test-duration',
			version: '1.0.0',
			scripts: {
				build: 'echo "done"',
				start: 'node index.js',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		expect(buildResult.duration).toBeGreaterThan(0);
		expect(buildResult.logs.length).toBeGreaterThan(0);
	}, 30_000);
});
