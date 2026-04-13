#!/usr/bin/env bun

/**
 * @agentuity/migrate CLI entry point
 *
 * Usage:
 *   npx @agentuity/migrate [project-dir] [options]
 *
 * Options:
 *   --yes, -y        Skip interactive confirmation prompts
 *   --dry-run        Print migration report without modifying any files
 *   --v1-to-v2       Force v1 → v2 migration mode
 *   --v2-to-v3       Force v2 → v3 migration mode
 *   --help, -h       Show this help message
 */

export {};

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
	console.log(`
  ${'\x1b[1m'}@agentuity/migrate${'\x1b[0m'} — Migrate Agentuity SDK projects

  ${'\x1b[2m'}Usage:${'\x1b[0m'}
    npx @agentuity/migrate [project-dir] [options]

  ${'\x1b[2m'}Arguments:${'\x1b[0m'}
    project-dir        Path to the project to migrate (default: current directory)

  ${'\x1b[2m'}Options:${'\x1b[0m'}
    --yes, -y          Skip interactive confirmation prompts
    --dry-run          Print the migration report without modifying any files
    --v1-to-v2         Force v1 → v2 migration mode
    --v2-to-v3         Force v2 → v3 migration mode
    --help, -h         Show this help message

  ${'\x1b[2m'}Auto-detection:${'\x1b[0m'}
    The tool reads package.json and picks the right migration automatically:
    • @agentuity/runtime ^1.x → runs v1 → v2 migration
    • @agentuity/runtime ^2.x → runs v2 → v3 migration
    • Use --v1-to-v2 or --v2-to-v3 to override detection

  ${'\x1b[2m'}v1 → v2 migration:${'\x1b[0m'}
    • Rewrites route files to chained  new Hono<Env>()  style
    • Generates  src/api/index.ts  and  src/agent/index.ts  barrel files
    • Removes  src/generated/  directory
    • Updates @agentuity/* packages to ^2.0.0

  ${'\x1b[2m'}v2 → v3 migration:${'\x1b[0m'}
    • Replaces createApp() with plain Hono app + @agentuity/hono middleware
    • Converts simple agents to plain exported functions
    • Generates src/services.ts with singleton service clients
    • Rewrites c.var.*/ctx.* service access to direct imports
    • Moves entry point from app.ts → src/index.ts
    • Removes @agentuity/runtime, adds hono + service packages

  ${'\x1b[2m'}Safety:${'\x1b[0m'}
    The tool checks that your git worktree is clean before making any changes,
    so you can always review the diff or roll back with  git checkout .
`);
	process.exit(0);
}

// Parse flags
const yes = args.includes('--yes') || args.includes('-y');
const dryRun = args.includes('--dry-run');
const forceV1toV2 = args.includes('--v1-to-v2');
const forceV2toV3 = args.includes('--v2-to-v3');

// First non-flag argument is the project dir
const projectDir = args.find((a) => !a.startsWith('-')) ?? process.cwd();

// ---------------------------------------------------------------------------
// Auto-detect migration mode from package.json
// ---------------------------------------------------------------------------

async function detectMigrationMode(dir: string): Promise<'v1-to-v2' | 'v2-to-v3' | null> {
	try {
		const pkgPath = `${dir}/package.json`;
		const file = Bun.file(pkgPath);
		if (!(await file.exists())) return null;

		const pkg = JSON.parse(await file.text());
		const deps = { ...pkg.dependencies, ...pkg.devDependencies };
		const runtimeVersion = deps['@agentuity/runtime'];

		if (!runtimeVersion) return null;

		// ^1.x or 1.x → v1 to v2
		if (/^[~^]?1\./.test(runtimeVersion) || runtimeVersion === '1') {
			return 'v1-to-v2';
		}

		// ^2.x or 2.x or latest or * or workspace:* → v2 to v3
		if (
			/^[~^]?2\./.test(runtimeVersion) ||
			runtimeVersion === 'latest' ||
			runtimeVersion === '*' ||
			runtimeVersion.startsWith('workspace:')
		) {
			return 'v2-to-v3';
		}

		return null;
	} catch {
		return null;
	}
}

// Determine which migration to run
let mode: 'v1-to-v2' | 'v2-to-v3';

if (forceV1toV2) {
	mode = 'v1-to-v2';
} else if (forceV2toV3) {
	mode = 'v2-to-v3';
} else {
	const detected = await detectMigrationMode(projectDir);
	if (!detected) {
		console.error(
			'\n  \x1b[31m✗\x1b[0m  Could not detect migration mode.\n\n' +
				'     No @agentuity/runtime found in package.json, or version is not\n' +
				'     recognized as v1.x or v2.x.\n\n' +
				'     Use --v1-to-v2 or --v2-to-v3 to specify the migration explicitly.\n'
		);
		process.exit(1);
	}
	mode = detected;
}

// Run the appropriate migration
if (mode === 'v1-to-v2') {
	console.log('\n  \x1b[36mℹ\x1b[0m  Detected v1 project — running v1 → v2 migration\n');
	const { migrate } = await import('../src/migrate');
	const result = await migrate({ projectDir, yes, dryRun });
	process.exit(result.ok ? 0 : 1);
} else {
	console.log('\n  \x1b[36mℹ\x1b[0m  Detected v2 project — running v2 → v3 migration\n');
	const { migrateV3 } = await import('../src/migrate-v3');
	const result = await migrateV3({ projectDir, yes, dryRun });
	process.exit(result.ok ? 0 : 1);
}
