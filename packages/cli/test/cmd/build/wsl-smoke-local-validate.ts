/**
 * Local end-to-end validation of the WSL CI smoke layout.
 *
 * Mirrors:
 *   cd <sdk-like monorepo>
 *   agentuity project create --name test-wsl-… --framework hono \
 *     --package-manager bun --database skip --storage skip --confirm
 *   # then deploy detection + pack-only staging
 *
 * Usage (from packages/cli):
 *   bun test/cmd/build/wsl-smoke-local-validate.ts
 *
 * Optional cloud pack (needs auth + registered project — skipped by default):
 *   WSL_SMOKE_PACK_ONLY=1 bun test/cmd/build/wsl-smoke-local-validate.ts
 *
 * Does not invent CLI flags; uses --package-manager (kebab-case) only.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectMonorepoContext } from '../../../src/cmd/build/detect/monorepo.ts';
import { detectFrameworkWithPackageJson } from '../../../src/cmd/build/detect/index.ts';
import { getAdapter } from '../../../src/cmd/build/adapters/index.ts';
import { packageBuildOutput } from '../../../src/cmd/build/package/index.ts';
import { runBuildPipeline } from '../../../src/cmd/build/run.ts';
import { PACK_ONLY_DEPLOYMENT_ID } from '../../../src/cmd/build/adapters/cdn-origin.ts';

// test/cmd/build → packages/cli
const CLI_ROOT = join(import.meta.dir, '../../..');
const CLI_ENTRY = join(CLI_ROOT, 'src/main.ts');

function fail(msg: string): never {
	console.error(`FAIL: ${msg}`);
	process.exit(1);
}

function ok(msg: string): void {
	console.log(`✓ ${msg}`);
}

function main(): void {
	const work = join(
		tmpdir(),
		`wsl-smoke-validate-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	const monoRoot = join(work, 'sdk-like');
	const smokeName = `test-wsl-local-${Date.now()}`;

	mkdirSync(monoRoot, { recursive: true });
	writeFileSync(
		join(monoRoot, 'package.json'),
		JSON.stringify(
			{
				name: 'sdk-like-mono',
				private: true,
				workspaces: ['packages/*', 'docs', 'tests', 'tests/frameworks/*'],
			},
			null,
			2
		)
	);
	writeFileSync(join(monoRoot, 'bun.lock'), '{ "lockfileVersion": 1 }\n');
	mkdirSync(join(monoRoot, 'packages', 'cli'), { recursive: true });
	writeFileSync(
		join(monoRoot, 'packages', 'cli', 'package.json'),
		JSON.stringify({ name: '@fake/cli', version: '0.0.0' })
	);

	console.log('Work dir:', work);
	console.log('Monorepo root:', monoRoot);
	console.log('Smoke name:', smokeName);

	// Real CLI create — same flags as WSL CI (plus --no-register for local).
	const create = spawnSync(
		'bun',
		[
			CLI_ENTRY,
			'project',
			'create',
			'--name',
			smokeName,
			'--framework',
			'hono',
			'--package-manager',
			'bun',
			'--database',
			'skip',
			'--storage',
			'skip',
			'--confirm',
			'--no-register',
			'--no-install',
		],
		{
			cwd: monoRoot,
			encoding: 'utf-8',
			env: { ...process.env },
		}
	);

	if (create.status !== 0) {
		console.error(create.stdout);
		console.error(create.stderr);
		fail(`project create exited ${create.status}`);
	}
	ok('project create succeeded with --package-manager bun');

	const smokeDir = join(monoRoot, smokeName);
	if (!existsSync(join(smokeDir, 'package.json'))) {
		fail(`expected package.json at ${smokeDir}`);
	}
	ok(`smoke app scaffolded at ${smokeDir}`);

	// --- Detection checks (same as deploy Discover) ---
	void (async () => {
		try {
			const monorepo = await detectMonorepoContext(smokeDir);
			if (monorepo !== null) {
				fail(
					`expected monorepo=null for non-member smoke app, got root=${monorepo.root} subpath=${monorepo.subpath}`
				);
			}
			ok('detectMonorepoContext → null (not packaging whole monorepo)');

			const { framework } = await detectFrameworkWithPackageJson(smokeDir);
			if (!framework) fail('framework detection returned null');
			ok(`framework detected: ${framework.name} (${framework.runtime})`);

			const adapter = getAdapter(framework.name);
			ok(`adapter: ${adapter.name}`);

			// launch.json must not get monorepo workingDirectory
			const outDir = join(smokeDir, '.agentuity-validate');
			const packageResult = packageBuildOutput(
				framework,
				{
					outputDir: outDir,
					startCommand: framework.startCommand,
					serverEntry: framework.serverEntry,
					port: framework.port,
					duration: 0,
					logs: [],
				},
				outDir,
				smokeDir,
				undefined
			);
			const wd = packageResult.launch.processes?.[0]?.workingDirectory;
			if (wd) {
				fail(`expected no workingDirectory on launch process, got ${wd}`);
			}
			ok('packageBuildOutput: no monorepo workingDirectory');

			// Optional: full pack-only pipeline (build + zip) without upload
			if (process.env.WSL_SMOKE_PACK_ONLY === '1') {
				const logger = {
					trace: (...a: unknown[]) => console.log('[trace]', ...a),
					debug: (...a: unknown[]) => console.log('[debug]', ...a),
					info: (...a: unknown[]) => console.log('[info]', ...a),
					warn: (...a: unknown[]) => console.warn('[warn]', ...a),
					error: (...a: unknown[]) => console.error('[error]', ...a),
					fatal: (...a: unknown[]) => {
						console.error('[fatal]', ...a);
						throw new Error(String(a[0]));
					},
					child: () => logger,
				};
				const collector = {
					startDiagnostic: () => () => {},
					addGeneralError: () => {},
					forceWrite: async () => {},
				};

				const pipeline = await runBuildPipeline({
					projectDir: smokeDir,
					logger: logger as never,
					collector: collector as never,
					skipTypeCheck: true,
					deploymentId: PACK_ONLY_DEPLOYMENT_ID,
				});

				if (pipeline.monorepo !== null) {
					fail(
						`pack pipeline monorepo should be null, got ${JSON.stringify(pipeline.monorepo)}`
					);
				}
				ok(`runBuildPipeline monorepo=null staging=${pipeline.outputDir}`);
				ok(`build logs:\n  ${pipeline.logs.join('\n  ')}`);
			} else {
				console.log(
					'(skip full build pipeline — set WSL_SMOKE_PACK_ONLY=1 to run install+build locally)'
				);
			}

			// Show scaffold listen bind (template change)
			const indexTs = readFileSync(join(smokeDir, 'src', 'index.ts'), 'utf-8');
			if (!indexTs.includes('0.0.0.0') && !indexTs.includes('HOST')) {
				fail('hono template should bind HOST / 0.0.0.0 for container health probes');
			}
			ok('hono template binds 0.0.0.0 / HOST');

			console.log('\nPASS: WSL smoke layout validation');
			console.log('Cleanup:', work);
		} catch (e) {
			console.error(e);
			process.exit(1);
		} finally {
			if (process.env.WSL_SMOKE_KEEP === '1') {
				console.log('WSL_SMOKE_KEEP=1 — leaving', work);
			} else {
				rmSync(work, { recursive: true, force: true });
			}
		}
	})();
}

main();
