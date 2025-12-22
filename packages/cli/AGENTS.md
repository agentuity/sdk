# Agent Guidelines for @agentuity/cli

## Package Overview

Bun-native CLI framework for Agentuity applications. Provides command structure, auto-discovery, configuration management, and type-safe command options.

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
- **TUI output**: Use `tui.*` helpers for formatted output (see `src/tui.md`)
- **Logging**: Use `ctx.logger`; `logger.fatal()` logs and exits with code 1
- **Bun APIs**: Use `Bun.file(f).exists()` not `existsSync(f)`

## Creating Commands

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
			.option('-f, --force', 'Force deployment', false)
			.option('--dry-run', 'Dry run mode', false)
			.action(async (environment: string, options: DeployOptions) => {
				ctx.logger.info(`Deploying to: ${environment}`);
			});
	},
};

export default deployCommand;
```

## Build Architecture

See [docs/build-architecture.md](docs/build-architecture.md) for Vite + Bun build system details.

## Publishing

1. Run `bun run build`
2. Test CLI with `bun bin/cli.ts`
3. Depends on `@agentuity/core` and `commander`
