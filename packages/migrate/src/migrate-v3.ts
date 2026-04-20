/**
 * V2 → V3 migration orchestrator.
 *
 * Flow:
 *   1. Check git worktree is clean (bail if not)
 *   2. Run v3 detection
 *   3. Print report
 *   4. Interactive confirmation (unless --yes)
 *   5. Apply transforms:
 *      a. Generate src/services.ts
 *      b. Transform agent files
 *      c. Rewrite service access in route files
 *      d. Generate new entry point (src/index.ts)
 *      e. Delete old app.ts
 *      f. Delete agentuity.config.ts
 *      g. Delete src/agent/index.ts barrel
 *      h. Update package.json
 *   6. Run bun install
 *   7. Run typecheck
 *   8. Print final summary
 */

import {
	existsSync,
	writeFileSync,
	unlinkSync,
	mkdirSync,
	readdirSync,
	readFileSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';

import { detectV3 } from './detect-v3';
import {
	printV3Report,
	printStep,
	printStepDone,
	printStepFailed,
	printStepSkipped,
	printWarning,
	printError,
	printSuccess,
	printManualSummaryV3,
	printChangeSummary,
} from './report';
import { generateEntryPoint } from './transforms/v3/entry-point';
import { transformAgentFile } from './transforms/v3/agents';
import { generateServicesFile } from './transforms/v3/services';
import {
	transformRouteServices,
	computeServicesRelativePath,
	insertAfterImports,
	removeRuntimeImports,
	rewriteV2AgentMethods,
	stripAgentuityValidators,
	stubV2HonoContext,
} from './transforms/v3/routes';
import { transformPackageJsonV3 } from './transforms/v3/package-json';
import { generateDevSetup } from './transforms/v3/dev-setup';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrateV3Options {
	/** Project directory (defaults to cwd) */
	projectDir?: string;
	/** Skip interactive confirmation */
	yes?: boolean;
	/** Only run detection + print report, no transforms */
	dryRun?: boolean;
}

export type MigrateV3Result = { ok: true; changedFiles: string[] } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function isGitWorktreeClean(projectDir: string): Promise<boolean> {
	try {
		const result = Bun.spawn(['git', 'status', '--porcelain'], {
			cwd: projectDir,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const output = await new Response(result.stdout).text();
		return output.trim() === '';
	} catch {
		return true;
	}
}

function readFileSyncSafe(path: string): string | null {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return null;
	}
}

function isGitRepo(projectDir: string): boolean {
	try {
		const result = Bun.spawnSync(['git', 'rev-parse', '--is-inside-work-tree'], {
			cwd: projectDir,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		return result.exitCode === 0;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Interactive confirm
// ---------------------------------------------------------------------------

async function confirm(message: string): Promise<boolean> {
	process.stdout.write(`  ${message} ${'\x1b[2m'}[y/N]${'\x1b[0m'} `);

	const line = await new Promise<string>((resolve) => {
		let buf = '';
		process.stdin.setEncoding('utf8');
		process.stdin.resume();
		process.stdin.once('data', (chunk) => {
			buf += chunk.toString();
			process.stdin.pause();
			resolve(buf.trim());
		});
	});

	return line.toLowerCase() === 'y' || line.toLowerCase() === 'yes';
}

// ---------------------------------------------------------------------------
// Typecheck
// ---------------------------------------------------------------------------

async function runTypecheck(projectDir: string): Promise<{ ok: boolean; output: string }> {
	try {
		const proc = Bun.spawn(['bunx', 'tsc', '--noEmit', '--skipLibCheck'], {
			cwd: projectDir,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
		return { ok: proc.exitCode === 0, output: combined };
	} catch (e) {
		return { ok: false, output: String(e) };
	}
}

// ---------------------------------------------------------------------------
// Bun install
// ---------------------------------------------------------------------------

async function runBunInstall(projectDir: string): Promise<{ ok: boolean; error?: string }> {
	try {
		const proc = Bun.spawn(['bun', 'install', '--silent'], {
			cwd: projectDir,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		await proc.exited;
		return {
			ok: proc.exitCode === 0,
			error: proc.exitCode !== 0 ? 'bun install failed' : undefined,
		};
	} catch (e) {
		return { ok: false, error: String(e) };
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function migrateV3(opts: MigrateV3Options = {}): Promise<MigrateV3Result> {
	const projectDir = resolve(opts.projectDir ?? process.cwd());

	if (!existsSync(projectDir)) {
		printError(`Project directory does not exist: ${projectDir}`);
		return { ok: false, reason: 'Project directory not found' };
	}

	// ── 1. Git worktree check (skip for dry-run — no files are modified) ──
	if (!opts.dryRun) {
		if (isGitRepo(projectDir)) {
			const isClean = await isGitWorktreeClean(projectDir);
			if (!isClean) {
				printError(
					'Git worktree is not clean.\n\n' +
						'       The migration tool rewrites source files. Please commit or stash\n' +
						'       your current changes before running the migration, so you can\n' +
						'       easily review the diff or roll back if needed.\n\n' +
						'       Run:  git status\n' +
						'         or:  git stash'
				);
				return { ok: false, reason: 'Git worktree is not clean' };
			}
		} else {
			printWarning(
				'Project is not in a git repository. It is strongly recommended to\n' +
					'       version-control your project before running the migration.'
			);
			if (!opts.yes) {
				const proceed = await confirm('Proceed without git? This cannot be undone.');
				if (!proceed) {
					console.log('\n  Migration cancelled.\n');
					return { ok: false, reason: 'User cancelled' };
				}
			}
		}
	}

	// ── 2. Detection ──────────────────────────────────────────────────────
	console.log('\n  Scanning project for v2 patterns…');
	const detection = await detectV3(projectDir);

	// ── 3. Report ─────────────────────────────────────────────────────────
	printV3Report(detection);

	if (detection.findings.length === 0) {
		return { ok: true, changedFiles: [] };
	}

	if (opts.dryRun) {
		console.log('  (dry-run mode — no files modified)\n');
		return { ok: true, changedFiles: [] };
	}

	const hasAuto = detection.findings.some((f) => f.severity === 'auto');
	const hasGuided = detection.findings.some((f) => f.severity === 'guided');

	if (!hasAuto && !hasGuided) {
		console.log('  All findings require manual action. No automated transforms available.\n');
		printManualSummaryV3(detection);
		return { ok: true, changedFiles: [] };
	}

	// ── 4. Confirmation ───────────────────────────────────────────────────
	if (!opts.yes) {
		const proceed = await confirm('Apply the auto-fixable and guided transforms listed above?');
		if (!proceed) {
			console.log('\n  Migration cancelled.\n');
			return { ok: false, reason: 'User cancelled' };
		}
	}

	console.log();

	const changedFiles: string[] = [];
	const allChangeSummary: { file: string; changes: string[] }[] = [];
	let devScripts: Record<string, string> | undefined;

	// ── 5a. Generate src/services.ts ──────────────────────────────────────
	if (detection.allServicesUsed.length > 0) {
		printStep('Generating src/services.ts');
		const result = generateServicesFile(detection.allServicesUsed);

		if (result.source) {
			const servicesPath = join(projectDir, 'src', 'services.ts');
			mkdirSync(dirname(servicesPath), { recursive: true });
			writeFileSync(servicesPath, result.source, 'utf8');
			changedFiles.push('src/services.ts');
			allChangeSummary.push({ file: 'src/services.ts', changes: result.changes });
			printStepDone(`${detection.allServicesUsed.length} service(s)`);
		} else {
			printStepSkipped('no services used');
		}
	}

	// ── 5b. Transform agent files ─────────────────────────────────────────
	if (detection.agentFiles.length > 0) {
		console.log(`\n  Transforming ${detection.agentFiles.length} agent file(s):`);

		for (const agentFile of detection.agentFiles) {
			printStep(agentFile.relativePath);

			const src = await Bun.file(agentFile.path).text();
			const servicesPath = computeServicesRelativePath(projectDir, agentFile.path);
			const result = transformAgentFile(src, agentFile, servicesPath);

			if (result.source !== null) {
				writeFileSync(agentFile.path, result.source, 'utf8');
				changedFiles.push(agentFile.relativePath);
				allChangeSummary.push({ file: agentFile.relativePath, changes: result.changes });
				if (result.manualRequired) {
					printStepDone('migration comment added (manual review needed)');
				} else {
					printStepDone();
				}
			} else {
				printStepSkipped(result.changes[0] ?? 'no changes');
			}
		}
	}

	// ── 5c. Rewrite service access in route files ─────────────────────────
	const routeServiceUsages = detection.serviceUsages.filter(
		(u) =>
			u.accessPattern === 'c.var' &&
			// Don't process app.ts (it's being replaced)
			u.relativePath !== 'app.ts'
	);

	if (routeServiceUsages.length > 0) {
		console.log(`\n  Rewriting service access in ${routeServiceUsages.length} route file(s):`);

		for (const usage of routeServiceUsages) {
			printStep(usage.relativePath);

			const src = await Bun.file(usage.path).text();
			const servicesPath = computeServicesRelativePath(projectDir, usage.path);
			const result = transformRouteServices(src, usage, servicesPath);

			if (result.source !== null) {
				writeFileSync(usage.path, result.source, 'utf8');
				changedFiles.push(usage.relativePath);
				allChangeSummary.push({ file: usage.relativePath, changes: result.changes });
				printStepDone();
			} else {
				printStepSkipped('no changes needed');
			}
		}
	}

	// ── 5c′. Remove @agentuity/runtime imports from all source files ─────
	{
		const srcDir = join(projectDir, 'src');
		if (existsSync(srcDir)) {
			const runtimeImportFiles: string[] = [];

			const walkForRuntimeImports = (dir: string) => {
				for (const entry of readdirSync(dir, { withFileTypes: true })) {
					const full = join(dir, entry.name);
					if (entry.isDirectory()) {
						if (['node_modules', 'dist', '.agentuity', '.git', 'web'].includes(entry.name))
							continue;
						walkForRuntimeImports(full);
					} else if (
						entry.isFile() &&
						(entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
					) {
						runtimeImportFiles.push(full);
					}
				}
			};

			walkForRuntimeImports(srcDir);

			let removedCount = 0;
			let anyFileNeededEnvType = false;
			for (const file of runtimeImportFiles) {
				const relPath = file.replace(projectDir + '/', '');
				// Skip files we've already modified
				if (changedFiles.includes(relPath)) continue;

				const src = await Bun.file(file).text();
				if (!src.includes('@agentuity/runtime')) continue;

				const cleanup = removeRuntimeImports(src);
				if (cleanup.removed) {
					let cleaned = cleanup.source;
					const extra: string[] = [];

					// If this file imported Env, add a typed import from the
					// local types helper. The helper file itself is emitted
					// once later in this step.
					if (cleanup.needsEnvType) {
						anyFileNeededEnvType = true;
						cleaned = insertAfterImports(
							cleaned,
							"import type { Env } from '../types/hono-env';"
						);
						extra.push("Added: import type { Env } from '../types/hono-env'");
					}

					// If the file had `validator` imported (or any <agent>.validator()
					// middleware style), strip those call sites too — v3 has no
					// equivalent.
					const stripped = stripAgentuityValidators(cleaned);
					if (stripped.changed) {
						cleaned = stripped.source;
						extra.push(...stripped.changes);
					}

					// Rewrite v2 agent method invocations (<agent>.run → <agent>,
					// c.req.valid('json') → await c.req.json()).
					const agentRewrite = rewriteV2AgentMethods(cleaned);
					if (agentRewrite.changed) {
						cleaned = agentRewrite.source;
						extra.push(...agentRewrite.changes);
					}

					// Stub v2 Hono context (c.var.thread, c.var.sessionId).
					const stub = stubV2HonoContext(cleaned);
					if (stub.changed) {
						cleaned = stub.source;
						extra.push(...stub.changes);
					}

					writeFileSync(file, cleaned, 'utf8');
					changedFiles.push(relPath);
					allChangeSummary.push({
						file: relPath,
						changes: ['Removed @agentuity/runtime imports', ...extra],
					});
					removedCount++;
				}
			}

			if (removedCount > 0) {
				printStep(`Removed @agentuity/runtime imports from ${removedCount} additional file(s)`);
				printStepDone();
			}
			void anyFileNeededEnvType; // subsumed by post-scan below
		}
	}

	// ── 5c″. Emit src/types/hono-env.ts if any changed file references it ───
	// Both the route service rewrite (5c) and the runtime import cleanup (5c′)
	// can emit `import type { Env } from '../types/hono-env'`. We create the
	// helper file once here by scanning the final content of changed files.
	{
		let helperNeeded = false;
		for (const rel of changedFiles) {
			try {
				const content = readFileSyncSafe(join(projectDir, rel));
				if (content && /from ['"]\.\.\/types\/hono-env['"]/.test(content)) {
					helperNeeded = true;
					break;
				}
			} catch {
				// ignore
			}
		}

		if (helperNeeded) {
			const helperPath = join(projectDir, 'src', 'types', 'hono-env.ts');
			if (!existsSync(helperPath)) {
				mkdirSync(dirname(helperPath), { recursive: true });
				const body =
					'/**\n' +
					' * Hono context variable type for Agentuity services.\n' +
					' *\n' +
					' * Generated by @agentuity/migrate during the v2 → v3 migration as the\n' +
					" * replacement for `import type { Env } from '@agentuity/runtime'`.\n" +
					' */\n' +
					"import type { Services } from '@agentuity/hono';\n\n" +
					'export type Env = { Variables: Services };\n';
				writeFileSync(helperPath, body, 'utf8');
				changedFiles.push('src/types/hono-env.ts');
				allChangeSummary.push({
					file: 'src/types/hono-env.ts',
					changes: ['Created — replaces `Env` type from @agentuity/runtime'],
				});
			}
		}
	}

	// ── 5d. Generate new entry point ──────────────────────────────────────
	if (detection.hasCreateApp) {
		printStep('Generating src/index.ts');
		const result = generateEntryPoint(detection);

		if (result.source) {
			const entryPath = join(projectDir, 'src', 'index.ts');
			mkdirSync(dirname(entryPath), { recursive: true });
			writeFileSync(entryPath, result.source, 'utf8');
			changedFiles.push('src/index.ts');
			allChangeSummary.push({ file: 'src/index.ts', changes: result.changes });
			printStepDone();
		} else {
			printStepSkipped('no createApp detected');
		}
	}

	// ── 5d′. Set up dev workflow for Hono + SPA ───────────────────────
	if (detection.hasFrontend && detection.hasViteConfig) {
		printStep('Setting up dev workflow (Vite proxy + concurrent servers)');

		const viteConfigPath = join(projectDir, 'vite.config.ts');
		const viteSource = await Bun.file(viteConfigPath).text();
		const devResult = generateDevSetup(viteSource);

		// Patch vite.config.ts with proxy
		if (devResult.viteConfig) {
			writeFileSync(viteConfigPath, devResult.viteConfig, 'utf8');
			changedFiles.push('vite.config.ts');
			allChangeSummary.push({ file: 'vite.config.ts', changes: devResult.viteChanges });
		}

		// Store dev scripts — they'll be applied in the package.json transform
		devScripts = {
			dev: devResult.devScript,
			'server:api': devResult.serverScript,
		};

		printStepDone();
	}

	// ── 5e. Delete old app.ts ─────────────────────────────────────────────
	if (detection.appTsPath && detection.hasCreateApp) {
		printStep('Removing old app.ts');
		try {
			unlinkSync(detection.appTsPath);
			changedFiles.push('app.ts (deleted)');
			allChangeSummary.push({
				file: 'app.ts',
				changes: ['Deleted — replaced by src/index.ts'],
			});
			printStepDone('deleted');
		} catch (e) {
			printStepFailed(String(e));
		}
	}

	// ── 5f. Delete agentuity.config.ts ────────────────────────────────────
	if (detection.hasAgentuityConfig) {
		printStep('Removing agentuity.config.ts');
		try {
			unlinkSync(join(projectDir, 'agentuity.config.ts'));
			changedFiles.push('agentuity.config.ts (deleted)');
			allChangeSummary.push({
				file: 'agentuity.config.ts',
				changes: ['Deleted — no longer used in v3'],
			});
			printStepDone('deleted');
		} catch (e) {
			printStepFailed(String(e));
		}
	}

	// ── 5g. Delete src/agent/index.ts barrel ──────────────────────────────
	if (detection.hasAgentBarrel) {
		printStep('Removing src/agent/index.ts barrel');
		try {
			unlinkSync(join(projectDir, 'src', 'agent', 'index.ts'));
			changedFiles.push('src/agent/index.ts (deleted)');
			allChangeSummary.push({
				file: 'src/agent/index.ts',
				changes: ['Deleted — agents barrel not needed in v3'],
			});
			printStepDone('deleted');
		} catch (e) {
			printStepFailed(String(e));
		}
	}

	// ── 5h. Update package.json ───────────────────────────────────────────
	const packageJsonPath = join(projectDir, 'package.json');
	if (existsSync(packageJsonPath)) {
		printStep('Updating package.json');

		try {
			const currentContent = await Bun.file(packageJsonPath).text();
			const result = transformPackageJsonV3(
				currentContent,
				detection.outdatedPackages,
				detection.allServicesUsed,
				{
					removeRuntime: detection.hasRuntimeDep,
					removeReact: detection.hasReactPackage,
					devScripts,
				}
			);

			if (result.content && result.changes.length > 0) {
				writeFileSync(packageJsonPath, result.content, 'utf8');
				changedFiles.push('package.json');
				allChangeSummary.push({ file: 'package.json', changes: result.changes });
				printStepDone(`${result.changes.length} change(s)`);
			} else {
				printStepSkipped('no changes needed');
			}
		} catch (e) {
			printStepFailed(String(e));
		}
	}

	console.log();

	// ── Print applied changes ──────────────────────────────────────────────
	printChangeSummary(allChangeSummary);

	// ── 6. Install dependencies ───────────────────────────────────────────
	if (existsSync(packageJsonPath) && changedFiles.length > 0) {
		printStep('Running bun install');
		const install = await runBunInstall(projectDir);
		if (install.ok) {
			printStepDone('done');
		} else {
			printStepFailed(String(install.error));
		}
	}

	// ── 7. Typecheck ─────────────────────────────────────────────────────
	const hasTsConfig = existsSync(join(projectDir, 'tsconfig.json'));
	if (hasTsConfig && changedFiles.length > 0) {
		printStep('Running TypeScript type check');
		const tc = await runTypecheck(projectDir);
		if (tc.ok) {
			printStepDone('no errors');
		} else {
			printStepFailed('type errors found');
			console.log('\n  TypeScript errors after migration:');
			console.log(
				tc.output
					.split('\n')
					.map((l) => `    ${l}`)
					.join('\n')
			);
			printWarning(
				'Type errors detected. Review the changes above and fix manually.\n' +
					'       The git diff will show exactly what was changed.'
			);
		}
	} else if (!hasTsConfig) {
		printWarning('No tsconfig.json found — skipping type check.');
	}

	// ── 8. Manual summary ─────────────────────────────────────────────────
	printManualSummaryV3(detection);

	if (changedFiles.length > 0) {
		printSuccess(
			`Migration complete! ${changedFiles.length} file(s) modified.\n` +
				`  Review the changes with: git diff`
		);
	} else {
		printSuccess('Migration complete! No files needed to be changed.');
	}

	return { ok: true, changedFiles };
}
