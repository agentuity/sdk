# CLI Internal Logging System

The Agentuity CLI includes a comprehensive internal logging system that captures all command executions for debugging purposes, even when the user has set a different log level or hasn't configured logging at all.

## Overview

Every CLI command execution creates a log session that captures:

- **Session metadata**: Command, arguments, environment variables (masked), system info, CLI version
- **Trace logs**: All log messages at trace/debug/info/warn/error levels in JSON Lines format

These logs are automatically stored and cleaned up, keeping only the most recent command execution.

## Architecture

### Components

1. **InternalLogger** (`src/internal-logger.ts`)
   - Captures all log messages at trace level
   - Writes to `~/.config/agentuity/logs/<session-id>/`
   - Creates two files per session:
      - `session.json` - Command metadata and environment
      - `logs.jsonl` - JSON Lines format log entries
   - Automatically masks sensitive environment variables (API keys, secrets, tokens, etc.)
   - Cleans up old log directories (keeps only the most recent)

2. **CompositeLogger** (`src/composite-logger.ts`)
   - Delegates log calls to multiple loggers simultaneously
   - Used to write to both the console logger and internal logger
   - Respects the console logger's log level while internal logger always captures at trace

3. **Console Logger** (existing, in `@agentuity/server`)
   - Standard console output
   - Respects user's `--log-level` flag and `AGENTUITY_LOG_LEVEL` env var
   - Provides colored, formatted output to the terminal

### Integration

The CLI entry point (`bin/cli.ts`) creates a composite logger that combines:

- Console logger (respects user's log level)
- Internal logger (always at trace level)

This means every log message goes to both destinations, but the console only shows messages at the user's configured level.

### Opt-Out of Internal Logging

Some commands opt out of internal logging by setting `skipInternalLogging: true` in their definition. This is useful for:

- Help commands (--help flag automatically skips logging)
- Support commands (viewing logs shouldn't create more logs)
- Commands that would create noise or circular dependencies

When `skipInternalLogging` is set, the internal logger is disabled and no session files are created.

## Usage

### For Users

#### View the most recent log

```bash
# Show full log with session metadata
agentuity support logs show

# Show only session metadata
agentuity support logs show --session

# Show last 50 log entries
agentuity support logs show --tail 50

# JSON output
agentuity support logs show --json
```

#### Get the log path

```bash
# Get the path to the most recent session directory
agentuity support logs path

# Get the path to the logs directory
agentuity support logs path --logs

# Copy logs for sharing
cp -r $(agentuity support logs path) ./my-logs
```

#### Share logs with support

```bash
# Option 1: Use the built-in support report command
agentuity support report

# Option 2: Compress and share the directory
tar -czf agentuity-logs.tar.gz -C $(agentuity support logs path) .

# Option 3: Get JSON output for copy/paste
agentuity support logs show --json > my-issue-logs.json
```

### For Developers

#### Add logging to your commands

The logger is available in the command context:

```typescript
export default createSubcommand({
	name: 'mycommand',
	description: 'My command',
	handler: async (ctx) => {
		// These will go to both console and internal log
		ctx.logger.info('Starting operation...');
		ctx.logger.debug('Debug details: %s', someVariable);
		ctx.logger.trace('Trace-level details: %o', complexObject);

		try {
			// ... do work
			ctx.logger.info('Operation completed successfully');
		} catch (error) {
			ctx.logger.error('Operation failed: %s', error);
			throw error;
		}
	},
});
```

#### Access internal logger directly

```typescript
import { getLatestLogSession, getLogsDirPath } from '@agentuity/cli';

// Get the latest log session directory
const sessionDir = getLatestLogSession();
if (sessionDir) {
	console.log('Latest logs:', sessionDir);
}

// Get the logs directory
const logsDir = getLogsDirPath();
console.log('All logs stored in:', logsDir);
```

## Log Structure

### Session Metadata (`session.json`)

```json
{
	"sessionId": "uuid-v4",
	"command": "cloud deploy",
	"args": ["--region", "us-east-1"],
	"timestamp": "2026-01-26T23:00:00.000Z",
	"cli": {
		"version": "0.1.34",
		"name": "@agentuity/cli"
	},
	"system": {
		"platform": "darwin",
		"arch": "arm64",
		"cpus": 10,
		"memory": 17179869184,
		"nodeVersion": "v20.0.0"
	},
	"environment": {
		"AGENTUITY_API_KEY": "ak_1...xyz",
		"PATH": "/usr/local/bin:/usr/bin",
		"SECRET_TOKEN": "***MASKED***"
	},
	"cwd": "/Users/user/my-project"
}
```

### Log Entries (`logs.jsonl`)

Each line is a JSON object:

```json
{"timestamp":"2026-01-26T23:00:00.123Z","level":"info","message":"Starting deployment..."}
{"timestamp":"2026-01-26T23:00:00.456Z","level":"debug","message":"Checking authentication","context":{"userId":"usr_123"}}
{"timestamp":"2026-01-26T23:00:01.789Z","level":"error","message":"Deployment failed: timeout"}
```

## Privacy & Security

### Sensitive Data Masking

The internal logger automatically masks sensitive environment variables:

- `AGENTUITY_API_KEY`, `AGENTUITY_SDK_KEY`
- `API_KEY`, `SECRET*`, `TOKEN*`, `PASSWORD*`, `PRIVATE_KEY`
- `AWS_*`, `GCP_*`, `AZURE_*`
- `DATABASE_URL`, `DB_*`

For long values (>12 chars), only the first and last 4 characters are shown.
For short values, they're completely masked as `***MASKED***`.

### Automatic Cleanup

The internal logger automatically cleans up old log directories when a new command starts, keeping only the most recent session. This prevents log buildup while ensuring the latest execution is always available for debugging.

### Disabling Internal Logging

If the internal logger fails to initialize or write logs (e.g., permission errors), it automatically disables itself to prevent errors from affecting CLI functionality.

## Troubleshooting

### Logs not being created

1. Check permissions on `~/.config/agentuity/logs`
2. Verify disk space is available
3. Look for console debug messages: `process.env.DEBUG=1 agentuity mycommand`

### Log directory full of old sessions

This shouldn't happen as the logger auto-cleans, but if it does:

```bash
# Manually clean logs directory
rm -rf ~/.config/agentuity/logs/*

# Run a command to create a fresh session
agentuity version
```

### Need logs from a crashed command

The internal logger writes logs synchronously as they occur, so even if the CLI crashes, you'll have logs up to the point of failure:

```bash
agentuity support logs show
```

## Future Enhancements

Potential future improvements:

- `agentuity support logs clean` - Manually clean old logs
- `agentuity support logs history` - Keep last N sessions instead of just 1
- `AGENTUITY_LOG_RETENTION` - Configure how many sessions to keep
- Automatic anonymization of file paths and hostnames in logs
