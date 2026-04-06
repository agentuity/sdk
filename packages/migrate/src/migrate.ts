/**
 * Migration orchestrator.
 *
 * Flow:
 *   1. Check git worktree is clean (bail if not)
 *   2. Run detection
 *   3. Print report
 *   4. Interactive confirmation (unless --yes)
 *   5. Apply codemods
 *   6. Run typecheck
 *   7. Print final summary
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { detect } from './detect';
import {
	printReport,
	printStep,
	printStepDone,
	printStepFailed,
	printStepSkipped,
	printWarning,
	printError,
	printSuccess,
	printManualSummary,
	printChangeSummary,
} from './report';
import { deleteGeneratedDir } from './transforms/generated';
import { transformAppTs } from './transforms/app-ts';
import { transformRouteFile } from './transforms/routes';
import { generateAgentBarrel, generateApiBarrel } from './transforms/barrels';
import { transformPackageJson } from './transforms/package-json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrateOptions {
	/** Project directory (defaults to cwd) */
	projectDir?: string;
	/** Skip interactive confirmation */
	yes?: boolean;
	/** Only run detection + print report, no transforms */
	dryRun?: boolean;
}

export type MigrateResult = { ok: true; changedFiles: string[] } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Git worktree cleanliness check
// ---------------------------------------------------------------------------

async function isGitWorktreeClean(projectDir: string): Promise<boolean> {
	try {
		const result = await Bun.spawn(['git', 'status', '--porcelain'], {
			cwd: projectDir,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const output = await new Response(result.stdout).text();
		return output.trim() === '';
	} catch {
		// git not available or not a git repo — allow migration to proceed
		return true;
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

	// Read a single line from stdin
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

export async function migrate(opts: MigrateOptions = {}): Promise<MigrateResult> {
	const projectDir = resolve(opts.projectDir ?? process.cwd());

	if (!existsSync(projectDir)) {
		printError(`Project directory does not exist: ${projectDir}`);
		return { ok: false, reason: 'Project directory not found' };
	}

	// ── 1. Git worktree check ──────────────────────────────────────────────
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

	// ── 2. Detection ──────────────────────────────────────────────────────
	console.log('\n  Scanning project for v1 patterns…');
	const detection = await detect(projectDir);

	// ── 3. Report ─────────────────────────────────────────────────────────
	printReport(detection);

	if (detection.findings.length === 0) {
		return { ok: true, changedFiles: [] };
	}

	if (opts.dryRun) {
		console.log('  (dry-run mode — no files modified)\n');
		return { ok: true, changedFiles: [] };
	}

	// Bail if there are manual-only findings with no automatable counterparts
	const hasAuto = detection.findings.some((f) => f.severity === 'auto');
	const hasGuided = detection.findings.some((f) => f.severity === 'guided');

	if (!hasAuto && !hasGuided) {
		console.log('  All findings require manual action. No automated transforms available.\n');
		printManualSummary(detection);
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

	// ── 5a. Delete src/generated/ ─────────────────────────────────────────
	if (detection.generatedDir) {
		printStep('Deleting src/generated/');
		try {
			deleteGeneratedDir(detection.generatedDir);
			changedFiles.push('src/generated/');
			printStepDone('directory removed');
		} catch (e) {
			printStepFailed(String(e));
		}
	}

	// Read original app.ts source before any transforms (needed by config transform)
	const originalAppSrc = detection.appTsPath ? await Bun.file(detection.appTsPath).text() : null;

	// ── 5b. Transform app.ts ──────────────────────────────────────────────
	if (detection.appTsPath && originalAppSrc !== null) {
		printStep('Transforming app.ts');
		const result = transformAppTs(originalAppSrc, detection);

		if (result.complexityError) {
			printStepFailed('complexity guard triggered');
			printWarning(result.complexityError);
		} else if (result.source !== null && result.changes.length > 0) {
			writeFileSync(detection.appTsPath, result.source, 'utf8');
			changedFiles.push('app.ts');
			allChangeSummary.push({ file: 'app.ts', changes: result.changes });
			printStepDone(`${result.changes.length} change(s)`);
		} else {
			printStepSkipped('no mechanical changes needed');
		}
	}

	// Note: analytics/workbench stay in createApp() in v2 - no config file migration needed

	// ── 5c. Transform v1 route files ──────────────────────────────────────
	if (detection.v1RouteFiles.length > 0) {
		console.log(`\n  Transforming ${detection.v1RouteFiles.length} route file(s):`);
		for (const routeFile of detection.v1RouteFiles) {
			const relPath = routeFile.replace(`${projectDir}/`, '');
			printStep(relPath);

			const src = await Bun.file(routeFile).text();
			const result = transformRouteFile(src);

			if (result.complexityError) {
				printStepFailed('complexity guard triggered');
				printWarning(`${relPath}: ${result.complexityError}`);
			} else if (result.source !== null && result.changes.length > 0) {
				writeFileSync(routeFile, result.source, 'utf8');
				changedFiles.push(relPath);
				allChangeSummary.push({ file: relPath, changes: result.changes });
				printStepDone();
			} else {
				printStepSkipped('already v2 style');
			}
		}
	}

	// ── 5e. Generate src/api/index.ts barrel ─────────────────────────────
	const apiBarrelFinding = detection.findings.find(
		(f) => f.id === 'missing-api-barrel' || f.id === 'api-barrel-stub'
	);
	if (apiBarrelFinding) {
		printStep('Generating src/api/index.ts barrel');
		const barrel = generateApiBarrel(projectDir);
		if (barrel) {
			const apiIndexPath = join(projectDir, 'src', 'api', 'index.ts');
			writeFileSync(apiIndexPath, barrel, 'utf8');
			changedFiles.push('src/api/index.ts');
			allChangeSummary.push({
				file: 'src/api/index.ts',
				changes: ['Generated API router barrel with AppRouter type export'],
			});
			printStepDone();
		} else {
			printStepSkipped('no route files found');
		}
	}

	// ── 5f. Generate src/agent/index.ts barrel ────────────────────────────
	if (!detection.hasAgentBarrel) {
		printStep('Generating src/agent/index.ts barrel');
		const barrel = generateAgentBarrel(projectDir);
		if (barrel) {
			const agentIndexPath = join(projectDir, 'src', 'agent', 'index.ts');
			writeFileSync(agentIndexPath, barrel, 'utf8');
			changedFiles.push('src/agent/index.ts');
			allChangeSummary.push({
				file: 'src/agent/index.ts',
				changes: ['Generated agent barrel exporting default array of all agents'],
			});
			printStepDone();
		} else {
			printStepSkipped('no agent files found');
		}
	}

	// ── 5g. Update @agentuity/* packages to ^2.0.0 ────────────────────────
	if (detection.outdatedPackages.length > 0) {
		printStep('Updating @agentuity/* packages to ^2.0.0');
		const packageJsonPath = join(projectDir, 'package.json');

		try {
			const currentContent = await Bun.file(packageJsonPath).text();
			const result = transformPackageJson(currentContent, detection.outdatedPackages);

			if (result.content && result.updated.length > 0) {
				writeFileSync(packageJsonPath, result.content, 'utf8');
				changedFiles.push('package.json');
				allChangeSummary.push({
					file: 'package.json',
					changes: result.updated,
				});
				printStepDone(`${result.updated.length} package(s) updated`);
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
	const hasPackageJson = existsSync(join(projectDir, 'package.json'));
	if (hasPackageJson && changedFiles.length > 0) {
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

	// ── 7. Manual summary ─────────────────────────────────────────────────
	printManualSummary(detection);

	if (changedFiles.length > 0) {
		printSuccess(
			`Migration complete! ${changedFiles.length} file(s) modified.\n` +
				'  Review the changes with: git diff'
		);
	} else {
		printSuccess('Migration complete! No files needed to be changed.');
	}

	return { ok: true, changedFiles };
}
