/**
 * End-to-end migrate test: v1 → v2 → v3.
 *
 * Strategy:
 *   1. Scaffold a fresh v1 project with `bunx create-agentuity@<latest-v1>`
 *   2. Run migrate --v1-to-v2 — expect exit 0, package.json on ^2.x
 *   3. Run migrate --v2-to-v3 — expect exit 0, package.json on ^3.x
 *   4. Inject local tarball overrides for @agentuity/* (since v3 isn't on
 *      npm 'latest' yet) and run `bun install` + `tsc --noEmit`.
 *
 * The test is gated behind MIGRATE_CHAIN_TEST=1 because:
 *   • It hits npm (bunx create-agentuity@<v>)
 *   • It runs bun install — slow (~30-90s)
 *   • It requires SDK tarballs (bash scripts/prepare-sdk-for-testing.sh)
 *
 * CI runs it as a dedicated job. Locally, run:
 *   MIGRATE_CHAIN_TEST=1 bun test packages/migrate/test/chain/
 */

import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { prepareTarballs, type TarballSet } from './prepare-tarballs';
import {
	createWorkDir,
	latestVersionForMajor,
	rewriteAgentuityDepsToTarballs,
	runBunInstall,
	runMigrate,
	runTypecheck,
	scaffoldProject,
} from './scaffold';

const RUN = process.env.MIGRATE_CHAIN_TEST === '1';

describe.skipIf(!RUN)('migrate chain v1 → v2 → v3', () => {
	let workDir: string;
	let tarballs: TarballSet;
	let projectDir: string;

	beforeAll(async () => {
		workDir = createWorkDir();
		tarballs = await prepareTarballs();
	}, 10 * 60_000);

	afterAll(() => {
		if (workDir && existsSync(workDir)) {
			rmSync(workDir, { recursive: true, force: true });
		}
	});

	it(
		'scaffolds a fresh v1 project from latest create-agentuity@1',
		async () => {
			const v1Latest = await latestVersionForMajor(1);
			console.log(`[chain] v1 latest: ${v1Latest}`);

			const { projectDir: pd, version } = await scaffoldProject({
				major: 1,
				name: 'proj',
				workDir,
			});
			projectDir = pd;

			expect(version).toBe(v1Latest);
			expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
			expect(existsSync(join(projectDir, 'app.ts'))).toBe(true);

			const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
			const hasAgentuityDep = Object.keys({
				...(pkg.dependencies ?? {}),
				...(pkg.devDependencies ?? {}),
			}).some((d) => d.startsWith('@agentuity/'));
			expect(hasAgentuityDep).toBe(true);
		},
		5 * 60_000
	);

	it(
		'runs v1 → v2 migration successfully',
		async () => {
			const result = await runMigrate(projectDir, 'v1-to-v2');
			if (result.exitCode !== 0) {
				console.error('[chain] v1→v2 migrate failed:\n' + result.stdout + result.stderr);
			}
			expect(result.exitCode).toBe(0);

			const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
			const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

			// Post v1→v2 expectations: @agentuity/runtime present on v2
			if (allDeps['@agentuity/runtime']) {
				expect(allDeps['@agentuity/runtime']).toMatch(/^\^?2\./);
			}
		},
		3 * 60_000
	);

	it(
		'runs v2 → v3 migration successfully',
		async () => {
			const result = await runMigrate(projectDir, 'v2-to-v3');
			if (result.exitCode !== 0) {
				console.error('[chain] v2→v3 migrate failed:\n' + result.stdout + result.stderr);
			}
			expect(result.exitCode).toBe(0);

			const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
			const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

			// v3 invariants
			expect(allDeps['@agentuity/runtime']).toBeUndefined();
			expect(allDeps['@agentuity/react']).toBeUndefined();
			expect(allDeps['@agentuity/hono']).toMatch(/^\^?3\./);
			expect(allDeps['hono']).toBeTruthy();

			// Entry point moved from app.ts → src/index.ts
			expect(existsSync(join(projectDir, 'src', 'index.ts'))).toBe(true);
			expect(existsSync(join(projectDir, 'app.ts'))).toBe(false);
			expect(existsSync(join(projectDir, 'agentuity.config.ts'))).toBe(false);

			// services.ts generated if any services detected
			// (optional — detect might not have any in a bare-bones template)
		},
		3 * 60_000
	);

	it(
		'installs deps and typechecks clean after full chain',
		async () => {
			await rewriteAgentuityDepsToTarballs(projectDir, tarballs.map);

			const install = runBunInstall(projectDir);
			if (install.exitCode !== 0) {
				console.error('[chain] bun install failed:\n' + install.output);
			}
			expect(install.exitCode).toBe(0);

			const tc = runTypecheck(projectDir);
			if (tc.exitCode !== 0) {
				console.error('[chain] tsc errors:\n' + tc.output);
			}
			expect(tc.exitCode).toBe(0);
		},
		5 * 60_000
	);
});
