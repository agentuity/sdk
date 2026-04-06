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
 *   --help, -h       Show this help message
 */

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
	console.log(`
  ${'\x1b[1m'}@agentuity/migrate${'\x1b[0m'} — Migrate an Agentuity SDK v1 project to v2

  ${'\x1b[2m'}Usage:${'\x1b[0m'}
    npx @agentuity/migrate [project-dir] [options]

  ${'\x1b[2m'}Arguments:${'\x1b[0m'}
    project-dir        Path to the project to migrate (default: current directory)

  ${'\x1b[2m'}Options:${'\x1b[0m'}
    --yes, -y          Skip interactive confirmation prompts
    --dry-run          Print the migration report without modifying any files
    --help, -h         Show this help message

  ${'\x1b[2m'}What it does:${'\x1b[0m'}
    • Detects v1 patterns (generated dir, old createApp config, mutable routes…)
    • Prints a categorised report: auto-fixable, guided, and manual changes
    • Asks for confirmation, then applies mechanical codemods
    • Rewrites route files to chained  new Hono<Env>()  style
    • Generates  src/api/index.ts  and  src/agent/index.ts  barrel files
    • Removes  src/generated/  directory
    • Guides you to delete  agentuity.config.ts  (config now in createApp/vite.config)
    • Runs  tsc --noEmit  to verify no type errors were introduced

  ${'\x1b[2m'}Safety:${'\x1b[0m'}
    The tool checks that your git worktree is clean before making any changes,
    so you can always review the diff or roll back with  git checkout .
`);
	process.exit(0);
}

// Parse flags
const yes = args.includes('--yes') || args.includes('-y');
const dryRun = args.includes('--dry-run');

// First non-flag argument is the project dir
const projectDir = args.find((a) => !a.startsWith('-')) ?? process.cwd();

const { migrate } = await import('../src/migrate');

const result = await migrate({ projectDir, yes, dryRun });

process.exit(result.ok ? 0 : 1);
