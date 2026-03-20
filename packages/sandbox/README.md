# @agentuity/sandbox

Standalone package for the Agentuity Sandbox service. Provides a simple, ergonomic client for creating and managing sandbox environments for code execution.

## Installation

```bash
npm install @agentuity/sandbox
```

## Quick Start

```typescript
import { SandboxClient } from '@agentuity/sandbox';

const client = new SandboxClient();

// Create a sandbox
const sandbox = await client.create();
console.log(`Created sandbox: ${sandbox.id}`);

// Execute a command
const execution = await sandbox.execute({
  command: ['node', '-e', 'console.log("Hello from sandbox!")']
});
console.log(`Execution status: ${execution.status}`);

// Write files to the sandbox
await sandbox.writeFiles([
  { path: '/app/index.js', content: 'console.log("Hello!")' }
]);

// Read a file
const stream = await sandbox.readFile('/app/index.js');

// Clean up
await sandbox.destroy();
```

## One-Shot Execution

Use the `run()` method for a create-execute-destroy lifecycle in one call:

```typescript
const result = await client.run({
  runtime: 'node',
  code: 'console.log("Hello!")'
});
console.log(result.stdout);
```

## API Reference

### `SandboxClient`

Main client for interacting with the sandbox service.

#### Constructor

```typescript
new SandboxClient(options?: SandboxClientOptions)
```

Options:
- `apiKey` - API key (defaults to `AGENTUITY_SDK_KEY` env var)
- `url` - Sandbox API URL (defaults to `AGENTUITY_SANDBOX_URL` env var)
- `orgId` - Organization ID
- `logger` - Custom logger instance

#### Methods

- `create(options?)` - Create a new sandbox, returns `SandboxInstance`
- `connect(sandboxId)` - Connect to an existing sandbox, returns `SandboxInstance`
- `get(sandboxId)` - Get sandbox info
- `destroy(sandboxId)` - Destroy a sandbox
- `run(options, io?)` - One-shot create-execute-destroy
- `pause(sandboxId)` - Pause a sandbox
- `resume(sandboxId)` - Resume a paused sandbox

### `SandboxInstance`

Represents a specific sandbox. Returned by `create()` and `connect()`.

#### Properties

- `id` - Sandbox ID
- `status` - Current status

#### Methods

- `execute(options)` - Execute a command
- `writeFiles(files)` - Write files to the sandbox
- `readFile(path)` - Read a file from the sandbox
- `listFiles(path?)` - List files in the sandbox
- `mkDir(path, recursive?)` - Create a directory
- `rmFile(path)` - Remove a file
- `rmDir(path, recursive?)` - Remove a directory
- `setEnv(env)` - Set environment variables
- `get()` - Get sandbox info
- `pause()` - Pause the sandbox
- `resume()` - Resume the sandbox
- `destroy()` - Destroy the sandbox

## License

Apache-2.0