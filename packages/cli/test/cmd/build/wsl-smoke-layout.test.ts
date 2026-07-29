/**
 * Mirrors the Windows WSL CLI smoke layout that regressed readiness:
 *
 *   <sdk-like monorepo>/
 *     package.json          workspaces: ["packages/*", ...]
 *     packages/cli/…        real workspace member
 *     test-wsl-<id>/        smoke app (NOT a workspace member)
 *
 * CI used to nest `project create` under the SDK checkout. Monorepo detection
 * treated that smoke dir as a subpackage and packaged the entire monorepo.
 * After the membership fix, the smoke app must deploy as a single package.
 *
 * This test does not hit the cloud; it validates the same detection + staging
 * decisions the deploy pipeline makes before upload.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAdapter } from '../../../src/cmd/build/adapters/index.ts';
import { copyMonorepoTree } from '../../../src/cmd/build/adapters/monorepo-stage.ts';
import { detectFrameworkWithPackageJson } from '../../../src/cmd/build/detect/index.ts';
import {
	detectMonorepoContext,
	isWorkspaceMember,
} from '../../../src/cmd/build/detect/monorepo.ts';
import { packageBuildOutput } from '../../../src/cmd/build/package/index.ts';

function makeTmp(prefix: string): string {
	const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function write(path: string, content: string): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, content);
}

/** SDK-shaped workspace patterns (subset matching production monorepo). */
const SDK_LIKE_WORKSPACES = ['packages/*', 'docs', 'tests', 'tests/frameworks/*'];

/**
 * Build a monorepo + nested smoke app the way WSL CI does after create.
 * Smoke package mirrors a minimal Hono scaffold (build + start scripts).
 */
function scaffoldWslSmokeLayout(root: string, smokeName: string): string {
	write(
		join(root, 'package.json'),
		JSON.stringify(
			{
				name: 'sdk-like-mono',
				private: true,
				workspaces: SDK_LIKE_WORKSPACES,
			},
			null,
			2
		)
	);
	write(join(root, 'bun.lock'), '{ "lockfileVersion": 1 }\n');

	// Real workspace member (like packages/cli)
	const pkgDir = join(root, 'packages', 'cli');
	write(join(pkgDir, 'package.json'), JSON.stringify({ name: '@fake/cli', version: '0.0.0' }));
	write(join(pkgDir, 'src', 'index.ts'), 'export {};\n');

	// Non-member smoke app (WSL creates this as a sibling of packages/)
	const smokeDir = join(root, smokeName);
	write(
		join(smokeDir, 'package.json'),
		JSON.stringify(
			{
				name: smokeName,
				type: 'module',
				scripts: {
					build: 'echo build-ok',
					start: 'bun src/index.ts',
				},
				dependencies: {
					hono: '^4.0.0',
					'@hono/node-server': '^1.0.0',
				},
			},
			null,
			2
		)
	);
	write(
		join(smokeDir, 'src', 'index.ts'),
		`import { serve } from '@hono/node-server';
import { Hono } from 'hono';
const app = new Hono();
app.get('/', (c) => c.text('ok'));
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? '0.0.0.0';
serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(\`Server is running on http://\${hostname}:\${info.port}\`);
});
`
	);
	write(join(smokeDir, 'bun.lock'), '{ "lockfileVersion": 1 }\n');
	// Minimal agentuity.json shape used by deploy paths
	write(
		join(smokeDir, 'agentuity.json'),
		JSON.stringify({
			projectId: 'proj_test_wsl_smoke',
			orgId: 'org_test',
		})
	);

	return smokeDir;
}

describe('WSL smoke layout (monorepo non-member)', () => {
	let root: string;
	let smokeDir: string;
	const smokeName = 'test-wsl-29879967266-1';

	beforeEach(() => {
		root = makeTmp('wsl-smoke-mono');
		smokeDir = scaffoldWslSmokeLayout(root, smokeName);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test('smoke path is not a workspace member of SDK-like patterns', () => {
		expect(isWorkspaceMember(smokeName, SDK_LIKE_WORKSPACES)).toBe(false);
		expect(isWorkspaceMember('packages/cli', SDK_LIKE_WORKSPACES)).toBe(true);
	});

	test('detectMonorepoContext returns null for the smoke app (regression)', async () => {
		const ctx = await detectMonorepoContext(smokeDir);
		expect(ctx).toBeNull();
	});

	test('detectMonorepoContext still finds packages/cli as a member', async () => {
		const ctx = await detectMonorepoContext(join(root, 'packages', 'cli'));
		expect(ctx).not.toBeNull();
		expect(ctx!.root).toBe(root);
		expect(ctx!.subpath).toBe('packages/cli');
		expect(ctx!.packageManager).toBe('bun');
	});

	test('smoke app detects as generic and uses generic adapter (not monorepo staging)', async () => {
		const { framework, packageJson } = await detectFrameworkWithPackageJson(smokeDir);
		expect(framework).not.toBeNull();
		expect(framework!.name).toBe('generic');
		expect(packageJson?.scripts?.start).toContain('bun');

		const adapter = getAdapter(framework!.name);
		expect(adapter.name).toBe('generic');

		const monorepo = await detectMonorepoContext(smokeDir);
		// Single-package packaging path: monorepo is null so workingDirectory
		// is not set to the smoke subpath of a monorepo root.
		expect(monorepo).toBeNull();

		const packageResult = await packageBuildOutput(
			framework!,
			{
				outputDir: join(smokeDir, '.agentuity'),
				startCommand: framework!.startCommand,
				serverEntry: framework!.serverEntry,
				staticDir: undefined,
				port: framework!.port,
				duration: 0,
				logs: [],
			},
			join(smokeDir, '.agentuity'),
			smokeDir,
			monorepo ?? undefined
		);

		const launch = packageResult.launch;
		const processes = launch.processes ?? [];
		expect(processes.length).toBeGreaterThan(0);
		// Without monorepo context, pilot must not get a monorepo workingDirectory.
		for (const proc of processes) {
			expect(proc.workingDirectory).toBeUndefined();
		}
	});

	test('forced monorepo staging would package the whole tree (documents the failure mode)', () => {
		// If membership check were skipped, copyMonorepoTree would ship packages/*
		// plus the smoke app — the broken CI behavior.
		const staging = makeTmp('wsl-smoke-staging');
		try {
			copyMonorepoTree({ root, subpath: smokeName, packageManager: 'bun' }, staging, {
				debug: () => {},
			});
			expect(existsSync(join(staging, 'packages', 'cli', 'package.json'))).toBe(true);
			expect(existsSync(join(staging, smokeName, 'package.json'))).toBe(true);
			expect(existsSync(join(staging, 'package.json'))).toBe(true);
			// Prove the smoke app is present under the monorepo root layout.
			const rootPkg = JSON.parse(readFileSync(join(staging, 'package.json'), 'utf-8')) as {
				workspaces: string[];
			};
			expect(rootPkg.workspaces).toContain('packages/*');
		} finally {
			rmSync(staging, { recursive: true, force: true });
		}
	});
});
