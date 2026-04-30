# Agent Guidelines for @agentuity/cli

## Package Overview

CLI framework for Agentuity applications. Provides command structure,
auto-discovery, configuration management, TUI helpers, and type-safe
command options.

## Commands

- **Build**: `bun run build` (compiles TS, copies non-TS assets, sets bin chmod)
- **Typecheck**: `bun run typecheck`
- **Clean**: `bun run clean`
- **Test CLI under Bun**: `bun bin/cli.ts [command]`
- **Test CLI under Node**: `node dist/bin/cli.js [command]` (after build)

## Runtime

The CLI source is **runtime-agnostic**:

- Builds and runs under **Bun 1.3+** (preferred for development; tests
  and build scripts assume Bun).
- Builds and runs under **Node.js 24+** (the published binary uses
  `#!/usr/bin/env node`).

The published entrypoint is `dist/bin/cli.js`, compiled from
`bin/cli.ts`. The `bin` field in `package.json` points there.

### How dual-runtime support is structured

- **CLI prod source uses zero `Bun.X` globals.** A pre-merge check
  enforces this (`tsconfig.json` sets `types: ["node"]`, so any
  accidental `Bun.X` reference fails type-check).
- **Genuine runtime-specific perf wins** (Bun's `S3Client`, native
  `bun:sqlite`) are accessed through dedicated abstractions:
  - `@agentuity/storage` package — dual-runtime S3 client, picked at
    install time via `package.json` `exports` conditions.
  - `node-compat/sqlite.ts` shim — runtime-detects `bun:sqlite` vs
    `node:sqlite` via dynamic `import()`.
  - `agent-detection.ts` — uses `bun:ffi` for fast process-tree
    walking on macOS-under-Bun, falls back to `ps` subprocess
    otherwise.
- **Everything else** routes through Node 24+ native APIs
  (`node:fs/promises`, `node:child_process`, `node:crypto`, `node:timers/promises`,
  `node:stream`, `fetch`, `URL`, etc.).
- **`packages/cli/src/node-compat/`** holds the small set of
  shims that survived Phase 5 cleanup. Each one encodes either
  project-specific semantics or substantially reduces verbosity:
  - `ansi.ts` — `color()` (Bun's `Bun.color` has no Node equivalent),
    `stripAnsi`, re-exports `stringWidth` from npm `string-width`.
  - `crypto.ts` — `shortHash16` (deterministic 16-hex-char hash;
    replaces Bun's xxHash64 in `domain.ts`).
  - `fs.ts` — `pathExists` and `openReadStream` (the two awkward
    Node idioms; everything else uses `node:fs/promises` directly).
  - `proc.ts` — `run`, `spawnInherit`, `spawnDetached`,
    `spawnStreamingOutput` (Bun.spawn → child_process plumbing
    is ~15 lines per use site).
  - `runtime-info.ts` — `runtimeKind`, `runtimeVersion`,
    `currentDir(import.meta)`, `gitSha`, `entryScriptPath`.
  - `sqlite.ts` — runtime-aware SQLite handle.
  - `stdin.ts` — `readStdinText`, `stdinWebStream`.
  - `which.ts` — PATH walker.

## Code Conventions

- **Command structure**: Each command is a directory in `src/cmd/`
  with `index.ts`.
- **Type safety**: Always define interfaces for command options
  (never `any`).
- **TUI output**: Use `tui.*` helpers for formatted output
  (`header`, `info`, `success`, `warning`, `error`, `table`,
  `progress`).
- **Logging**: Use `ctx.logger`; `logger.fatal()` logs and exits
  with code 1.
- **File I/O**: `await readFile(p, 'utf-8')` and `await writeFile(p, content)`
  from `node:fs/promises`. For existence checks, import
  `pathExists` from `node-compat/fs`.
- **No Bun globals in prod source.** `Bun.file`, `Bun.spawn`,
  `Bun.color`, `Bun.stringWidth`, etc. are forbidden — the tsconfig
  excludes Bun types, so any accidental reference is a type error.
- **Imports must use explicit `.ts` extensions** for relative paths
  (e.g., `from './foo.ts'`, not `from './foo'`). TypeScript's
  `rewriteRelativeImportExtensions` rewrites them to `.js` in the
  emitted output.
- **JSON mode**: Always check `isJSONMode()` for machine-readable
  output.
- **Auth**: Use `requireAuth(ctx)` or `optionalAuth(ctx)` for
  authenticated commands.

## Key Patterns

### Creating Commands

```typescript
// src/cmd/deploy/index.ts
import { z } from 'zod';
import { createCommand, type CommandContext } from '@agentuity/cli';

export default createCommand({
	name: 'deploy',
	description: 'Deploy to an environment',
	schema: {
		options: z.object({
			force: z.boolean().optional().describe('Force deployment'),
			dryRun: z.boolean().optional().describe('Dry run mode'),
		}),
	},
	async handler(ctx: CommandContext) {
		const { opts, logger } = ctx;
		logger.info(`Deploying with force=${opts.force}, dryRun=${opts.dryRun}`);
	},
});
```

### Output Modes

```typescript
import { isJSONMode, outputJSON, outputSuccess, createSuccessResponse } from '@agentuity/cli';

if (isJSONMode()) {
	outputJSON(createSuccessResponse({ data }));
} else {
	outputSuccess('Operation completed');
}
```

### File I/O

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { pathExists } from './node-compat/fs.ts';

if (await pathExists(configPath)) {
	const content = await readFile(configPath, 'utf-8');
	const data = JSON.parse(content);
	// ...
	await writeFile(configPath, JSON.stringify(data, null, 2));
}
```

### Subprocesses

```typescript
import { run, spawnInherit } from './node-compat/proc.ts';

// Capture stdout/stderr:
const { exitCode, stdout, stderr } = await run({ cmd: ['git', '--version'] });

// Pass-through stdio (e.g., for ssh, scp, the dev server):
const { exitCode } = await spawnInherit({ cmd: ['ssh', user, host] });
```

## Important Exports

- **CLI**: `createCLI`, `registerCommands`, `discoverCommands`
- **Output**: `isJSONMode`, `outputJSON`, `outputSuccess`, `outputInfo`,
  `outputWarning`, `tui.*`
- **Config**: `loadConfig`, `saveConfig`, `saveAuth`, `getAuth`,
  `clearAuth`
- **Auth**: `requireAuth`, `optionalAuth`, `APIClient`
- **Utils**: `runSteps`, `downloadGitHubTarball`, `createRepl`,
  `showBanner`

See `src/index.ts` for complete exports.

## Publishing

1. Run `bun run build` (compiles TS to `dist/`, copies `.md` and
   `templates/` assets, sets `chmod 0755` on `dist/bin/cli.js`).
2. Smoke-test with `node dist/bin/cli.js --version` (and
   `bun dist/bin/cli.js --version`) before publishing.
3. Depends on `@agentuity/core`, `@agentuity/server`,
   `@agentuity/storage`, plus npm deps: `commander`, `string-width`,
   `yaml`, `semver`, `tinyglobby`, `enquirer`, `archiver`, `tar`,
   `zod`.
