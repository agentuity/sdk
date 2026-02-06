# Agent Guidelines for @agentuity/cli

## Package Overview

Bun-native CLI framework for Agentuity applications. Provides command structure, auto-discovery, configuration management, TUI helpers, and type-safe command options.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `bun run clean`
- **Test CLI**: `bun bin/cli.ts [command]`

## Architecture

- **Runtime**: Bun 1.3+ (required for YAML support)
- **Framework**: commander.js
- **Config**: YAML from `~/.config/agentuity/production.yaml`
- **Commands**: Auto-discovered from `src/cmd/` directories

## Code Conventions

- **Command structure**: Each command is a directory in `src/cmd/` with `index.ts`
- **Type safety**: Always define interfaces for command options (never `any`)
- **TUI output**: Use `tui.*` helpers for formatted output (header, info, success, warning, error, table, progress)
- **Logging**: Use `ctx.logger`; `logger.fatal()` logs and exits with code 1
- **Bun APIs**: Use `Bun.file(f).exists()` not `existsSync(f)`
- **JSON mode**: Always check `isJSONMode()` for machine-readable output
- **Auth**: Use `requireAuth(ctx)` or `optionalAuth(ctx)` for authenticated commands

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

## Important Exports

- **CLI**: `createCLI`, `registerCommands`, `discoverCommands`
- **Output**: `isJSONMode`, `outputJSON`, `outputSuccess`, `outputInfo`, `outputWarning`, `tui.*`
- **Config**: `loadConfig`, `saveConfig`, `saveAuth`, `getAuth`, `clearAuth`
- **Auth**: `requireAuth`, `optionalAuth`, `APIClient`
- **Utils**: `runSteps`, `downloadGitHubTarball`, `createRepl`, `showBanner`

See `src/index.ts` for complete exports.

## Publishing

1. Run `bun run build`
2. Test CLI with `bun bin/cli.ts`
3. Depends on `@agentuity/core`, `@agentuity/server`, and `commander`
