# Standalone Agent Test

This is a test app that verifies the standalone agent execution feature works correctly.

## What it tests

1. **Auto-initialization**: `createAgentContext()` should work without manual runtime setup
2. **`ctx.run()` method**: Convenience method for running agents
3. **Agent execution**: Agents should execute correctly outside the HTTP server context

## Usage

```bash
# From the SDK root
bun install
bun run build

# Run the standalone test
cd apps/testing/standalone-agent
bun run test
```

## Expected output

The test should:

1. Create a standalone agent context (auto-initialized)
2. Run a simple echo agent
3. Validate the output
4. Exit with code 0 on success, 1 on failure

## Related Issue

- GitHub Issue #601: Standalone agent execution requires manual initialization
