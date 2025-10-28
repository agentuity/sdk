# Agent Guidelines for @agentuity/cli

## Package Overview

Bun-native CLI framework for Agentuity applications. Provides command structure, auto-discovery, configuration management, and type-safe command options.

## Commands

- **Build**: `bun run build` (generates type declarations only)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Clean**: `bun run clean` (removes dist/)
- **Test CLI**: `bun bin/cli.ts` (run CLI directly during development)

## Architecture

- **Runtime**: Bun 1.3+ (required for YAML support)
- **CLI Framework**: commander.js for command parsing and routing
- **Build target**: Distributes TypeScript source (no bundling needed)
- **Config**: YAML files loaded from `~/.config/agentuity/config.yaml`
- **Commands**: Auto-discovered from `src/cmd/` directories

## Structure

```text
src/
├── index.ts       # Public API exports
├── cli.ts         # CLI framework setup
├── runtime.ts     # Bun runtime validation
├── config.ts      # YAML config loader
├── logger.ts      # Structured logger with log levels
├── banner.ts      # Startup banner display
├── types.ts       # TypeScript type definitions
└── cmd/
    ├── index.ts   # Command auto-discovery
    └── example/   # Example command with subcommands
        ├── index.ts
        ├── create.ts
        └── list.ts
bin/
└── cli.ts         # CLI entry point
```

## Code Style

- **Bun-specific** - Uses Bun 1.3+ features (YAML, semver, colors)
- **TypeScript** - All code is TypeScript with strict mode
- **Type-safe options** - Always define interfaces for command options
- **Commander.js patterns** - Follow commander.js best practices
- **Async/await** - All I/O operations are async
- **Path aliases** - Use `@/` prefix for imports (e.g., `import { tui } from '@/tui'` instead of `../../tui`)

## Important Conventions

- **Command structure** - Each command is a directory in `src/cmd/` with index.ts
- **Subcommands** - Define in separate files, export as `SubcommandDefinition`
- **Type safety** - Always create interfaces for command options (never use `any`)
- **TUI Output** - Use `tui.*` helpers for formatted output without log prefixes:
   - `tui.success()`, `tui.error()`, `tui.warning()`, `tui.info()` for semantic messages
   - `tui.bold()`, `tui.muted()`, `tui.link()` for text formatting
   - See [src/tui.md](src/tui.md) for full documentation
- **Logging** - Use `ctx.logger` for standard logging (includes prefixes like `[INFO]`):
   - `logger.fatal(message)` - Log error and exit with code 1 (returns `never`)
   - Use `logger.fatal()` instead of `logger.error()` + `process.exit(1)`
- **Config** - Commands validate their own config requirements
- **Bun** - Always use Bun provided APIs vs legacy Node.JS APIs. For example use `Bun.file(f).exists()` instead of `existsSync(f)`

## Creating New Commands

1. Create directory in `src/cmd/`, e.g., `src/cmd/deploy/`
2. Create `index.ts` with `CommandDefinition`
3. For subcommands, create separate files with `SubcommandDefinition`
4. Export default from index.ts
5. Command is auto-discovered on next run

Example:

```typescript
// src/cmd/deploy/index.ts
import type { CommandDefinition, CommandContext } from '../../types';
import { Command } from 'commander';

interface DeployOptions {
	force: boolean;
	dryRun: boolean;
}

export const deployCommand: CommandDefinition = {
	name: 'deploy',
	description: 'Deploy to an environment',

	register(program: Command, ctx: CommandContext) {
		program
			.command('deploy <environment>')
			.description('Deploy to an environment')
			.option('-f, --force', 'Force deployment', false)
			.option('--dry-run', 'Dry run mode', false)
			.action(async (environment: string, options: DeployOptions) => {
				const { logger, config } = ctx;

				logger.info(`Deploying to: ${environment}`);

				if (options.dryRun) {
					logger.info('Dry run mode - no changes made');
					return;
				}

				// Implementation here
			});
	},
};

export default deployCommand;
```

## Testing

- Test by running: `bun bin/cli.ts [command]`
- Test with log levels: `bun bin/cli.ts --log-level=debug [command]`
- Test with custom config: `bun bin/cli.ts --config=/path/to/config.yaml [command]`
- Debug mode: `DEBUG=1 bun bin/cli.ts [command]` (shows API request/response details)

### Version Check Bypass (Development Only)

For local development, version checks can be bypassed (in priority order):

1. **CLI flag** (highest): `--skip-version-check`
2. **Environment variable**: `AGENTUITY_SKIP_VERSION_CHECK=1`
3. **Config override**: Add `skip_version_check: true` to profile's `overrides` section
4. **Auto-detection** (lowest): Versions `0.0.x` or `dev` are automatically skipped

See `.dev-notes.md` for more development tips.

## Publishing Checklist

1. Run `bun run build` to generate type declarations
2. Test CLI with `bun bin/cli.ts`
3. Verify banner displays correctly with no args
4. Test example commands work
5. Depends on `@agentuity/core` and `commander` (published separately)
