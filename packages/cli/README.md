# @agentuity/cli

Bun-native CLI framework for Agentuity applications.

## Requirements

- Bun 1.3.0 or higher

## Installation

```bash
# Global installation
bun install -g @agentuity/cli

# Local installation
bun add -d @agentuity/cli
```

## Usage

```bash
# Show banner and help
agentuity

# Top-level commands
agentuity auth login
agentuity project create my-app
agentuity build
agentuity dev

# Cloud commands
agentuity cloud keyvalue set mykey myvalue
agentuity cloud agents
agentuity cloud env list
agentuity cloud secret set MY_SECRET value

# AI commands
agentuity ai capabilities show
agentuity ai prompt llm
agentuity ai schema show

# Global options
agentuity --log-level=debug cloud keyvalue list
agentuity --config=/custom/path/production.yaml project list
```

## Configuration

The CLI loads configuration from `~/.config/agentuity/production.yaml` by default.

Example config:

```yaml
# ~/.config/agentuity/production.yaml
api:
   endpoint: https://api.agentuity.com
   token: your-token-here

defaults:
   environment: development
   region: us-west-2
```

You can override the config path with `--config`:

```bash
agentuity --config=/path/to/production.yaml [command]
```

## Log Levels

Control output verbosity with `--log-level`:

```bash
# Available levels: debug, trace, info, warn, error
agentuity --log-level=debug example create test
agentuity --log-level=error example list
```

## Command Structure

Commands are organized into groups:

- **Top-level**: `auth`, `project`, `version`, `build` (alias: `bundle`), `dev`
- **Cloud** (`cloud`): `keyvalue`, `agents`, `objectstore`, `env`, `secret`, and deployment-related commands
- **AI** (`ai`): `capabilities`, `prompt`, `schema`
- **Hidden**: `profile` (internal use only)

Commands are auto-discovered from the `src/cmd/` directory. Each command is a directory with an `index.ts` file.

### Simple Command

```typescript
// src/cmd/version/index.ts
import type { CommandDefinition, CommandContext } from '@agentuity/cli';
import { Command } from 'commander';

export const versionCommand: CommandDefinition = {
	name: 'version',
	description: 'Display version information',

	register(program: Command, ctx: CommandContext) {
		program
			.command('version')
			.description('Display version information')
			.action(() => {
				console.log('v1.0.0');
			});
	},
};

export default versionCommand;
```

### Command with Options

```typescript
// src/cmd/deploy/index.ts
import type { CommandDefinition, CommandContext } from '@agentuity/cli';
import { Command } from 'commander';

interface DeployOptions {
	force: boolean;
	dryRun: boolean;
}

export const deployCommand: CommandDefinition = {
	name: 'deploy',
	description: 'Deploy application',

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
					logger.info('Dry run - no changes made');
					return;
				}

				// Deployment logic here
			});
	},
};

export default deployCommand;
```

### Command with Subcommands

```typescript
// src/cmd/project/index.ts
import type { CommandDefinition, CommandContext } from '@agentuity/cli';
import { Command } from 'commander';
import { createSubcommand } from './create';
import { listSubcommand } from './list';

export const projectCommand: CommandDefinition = {
	name: 'project',
	description: 'Manage projects',
	subcommands: [createSubcommand, listSubcommand],

	register(program: Command, ctx: CommandContext) {
		const cmd = program.command('project').description('Manage projects');

		if (this.subcommands) {
			for (const sub of this.subcommands) {
				sub.register(cmd, ctx);
			}
		}

		cmd.action(() => cmd.help());
	},
};

export default projectCommand;
```

```typescript
// src/cmd/project/create.ts
import type { SubcommandDefinition, CommandContext } from '@agentuity/cli';
import { Command } from 'commander';

interface CreateOptions {
	template: string;
}

export const createSubcommand: SubcommandDefinition = {
	name: 'create',
	description: 'Create a new project',

	register(parent: Command, ctx: CommandContext) {
		parent
			.command('create <name>')
			.description('Create a new project')
			.option('-t, --template <template>', 'Project template', 'default')
			.action(async (name: string, options: CreateOptions) => {
				const { logger } = ctx;
				logger.info(`Creating project: ${name}`);
				// Implementation here
			});
	},
};
```

## Command Context

Every command receives a `CommandContext` with:

- `config`: Loaded YAML configuration
- `logger`: Structured logger (respects --log-level)
- `options`: Global CLI options

```typescript
.action(async (args, options) => {
	const { logger, config } = ctx;

	// Use logger for output
	logger.info('Starting...');
	logger.debug('Debug info');
	logger.warn('Warning');
	logger.error('Error occurred');

	// Access config
	const apiToken = config.api?.token;
});
```

## API

### Types

- `CommandDefinition` - Main command definition
- `SubcommandDefinition` - Subcommand definition
- `CommandContext` - Context passed to commands
- `Config` - Configuration object (`Record<string, unknown>`)
- `LogLevel` - Log level type (`'debug' | 'trace' | 'info' | 'warn' | 'error'`)
- `GlobalOptions` - Global CLI options

### Functions

- `createCLI(version: string)` - Create CLI program
- `registerCommands(program, commands, ctx)` - Register commands
- `discoverCommands()` - Auto-discover commands from src/cmd/
- `loadConfig(path?)` - Load YAML config
- `validateRuntime()` - Validate Bun runtime
- `showBanner(version)` - Show startup banner

## License

Apache 2.0
