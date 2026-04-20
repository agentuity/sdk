/**
 * Helpers to scaffold v1/v2 Agentuity projects using published create-agentuity
 * tarballs, then rewrite dependencies to point at local tarballs so we can
 * exercise the migrate tool against not-yet-published v3 packages.
 */

import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

export type MajorVersion = 1 | 2;

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..');

/**
 * Resolve the current latest published version on the given major line.
 *
 * We use `bun pm view` rather than hardcoding so the test tracks what users
 * actually get when they run `bun create agentuity@N` today.
 */
export async function latestVersionForMajor(major: MajorVersion): Promise<string> {
	const proc = Bun.spawnSync(['bun', 'pm', 'view', 'create-agentuity', 'versions', '--json'], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (proc.exitCode !== 0) {
		throw new Error(`bun pm view failed: ${new TextDecoder().decode(proc.stderr)}`);
	}
	const versions: string[] = JSON.parse(new TextDecoder().decode(proc.stdout));
	const stable = versions
		.filter((v) => !v.includes('-')) // exclude prereleases
		.filter((v) => v.startsWith(`${major}.`));

	if (stable.length === 0) {
		throw new Error(`No stable create-agentuity@${major}.x versions published`);
	}
	// versions are in publish order; last is latest
	return stable[stable.length - 1]!;
}

export interface ScaffoldOptions {
	/** Target major version for create-agentuity */
	major: MajorVersion;
	/** Name of the project directory (under workDir) */
	name: string;
	/** Parent directory where the project will live */
	workDir: string;
	/** Exact version pin (overrides latest lookup) */
	versionOverride?: string;
}

export interface ScaffoldResult {
	/** Absolute path to the scaffolded project */
	projectDir: string;
	/** Exact version that was used */
	version: string;
}

/**
 * Scaffold a fresh Agentuity project using `bunx create-agentuity@<major>`.
 */
export async function scaffoldProject(opts: ScaffoldOptions): Promise<ScaffoldResult> {
	const version = opts.versionOverride ?? (await latestVersionForMajor(opts.major));
	const spec = `create-agentuity@${version}`;

	console.log(`[scaffold] Using ${spec}`);

	const proc = Bun.spawnSync(
		[
			'bunx',
			spec,
			'--name',
			opts.name,
			'--dir',
			opts.workDir,
			'--template',
			'default',
			'--no-install',
			'--no-register',
			'--confirm',
		],
		{
			cwd: opts.workDir,
			stdout: 'pipe',
			stderr: 'pipe',
			env: {
				...process.env,
				// The v1/v2 scaffolder runs a post-scaffold `agentuity build --dev`;
				// we don't need it for the test (we just want source files).
				AGENTUITY_SKIP_VERSION_CHECK: '1',
				CI: '1',
			},
		}
	);

	// Note: we tolerate non-zero exit codes here. create-agentuity@1/2 try to run
	// `agentuity build --dev` after scaffolding which typically fails offline/
	// without credentials — the source files are still written correctly.
	const stdout = new TextDecoder().decode(proc.stdout);
	const stderr = new TextDecoder().decode(proc.stderr);

	const projectDir = join(opts.workDir, opts.name);
	if (!existsSync(join(projectDir, 'package.json'))) {
		throw new Error(
			`create-agentuity did not produce a project at ${projectDir}\n` +
				`stdout:\n${stdout}\n\nstderr:\n${stderr}`
		);
	}

	// Clean up artefacts from the scaffolder's post-setup hooks
	rmSync(join(projectDir, '.git'), { recursive: true, force: true });
	rmSync(join(projectDir, '.agentuity'), { recursive: true, force: true });
	rmSync(join(projectDir, 'node_modules'), { recursive: true, force: true });
	rmSync(join(projectDir, 'bun.lock'), { force: true });

	return { projectDir, version };
}

/**
 * Rewrite a project's package.json so all @agentuity/* deps resolve to local
 * tarballs instead of npm. Applied before running `bun install` inside the
 * project.
 */
export async function rewriteAgentuityDepsToTarballs(
	projectDir: string,
	tarballs: Record<string, string>
): Promise<void> {
	const pkgPath = join(projectDir, 'package.json');
	const pkg = JSON.parse(await Bun.file(pkgPath).text()) as Record<string, unknown>;

	const sections = ['dependencies', 'devDependencies'] as const;
	for (const section of sections) {
		const deps = pkg[section] as Record<string, string> | undefined;
		if (!deps) continue;
		for (const name of Object.keys(deps)) {
			if (name.startsWith('@agentuity/') && tarballs[name]) {
				deps[name] = tarballs[name]!;
			}
		}
	}

	// Add overrides so transitive @agentuity/* deps also hit the tarballs
	const overrides = (pkg.overrides as Record<string, string> | undefined) ?? {};
	for (const [name, path] of Object.entries(tarballs)) {
		if (name.startsWith('@agentuity/')) {
			overrides[name] = path;
		}
	}
	pkg.overrides = overrides;

	await Bun.write(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
}

/**
 * Create a temp directory that will be cleaned up when disposed.
 */
export function createWorkDir(prefix = 'migrate-chain-'): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Run the migrate CLI against a project.
 */
export async function runMigrate(
	projectDir: string,
	mode: 'v1-to-v2' | 'v2-to-v3'
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const binPath = join(REPO_ROOT, 'packages', 'migrate', 'bin', 'migrate.ts');
	const proc = Bun.spawnSync(['bun', binPath, `--${mode}`, '--yes', projectDir], {
		cwd: projectDir,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			...process.env,
			CI: '1',
		},
	});
	return {
		exitCode: proc.exitCode ?? -1,
		stdout: new TextDecoder().decode(proc.stdout),
		stderr: new TextDecoder().decode(proc.stderr),
	};
}

/**
 * Run `bun install` inside a project.
 */
export function runBunInstall(projectDir: string): { exitCode: number; output: string } {
	const proc = Bun.spawnSync(['bun', 'install'], {
		cwd: projectDir,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return {
		exitCode: proc.exitCode ?? -1,
		output: new TextDecoder().decode(proc.stdout) + '\n' + new TextDecoder().decode(proc.stderr),
	};
}

/**
 * Run `bunx tsc --noEmit` inside a project.
 */
export function runTypecheck(projectDir: string): { exitCode: number; output: string } {
	const proc = Bun.spawnSync(['bunx', 'tsc', '--noEmit'], {
		cwd: projectDir,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return {
		exitCode: proc.exitCode ?? -1,
		output: new TextDecoder().decode(proc.stdout) + '\n' + new TextDecoder().decode(proc.stderr),
	};
}
