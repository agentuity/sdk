# Agent Guidelines for @agentuity/bundler

## Package Overview

Build tool for Agentuity applications. Compiles agents, APIs, and web applications into optimized Bun bundles with bytecode support.

## Commands

- **Build**: `bun run build` (compiles bundler itself)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Clean**: `bun run clean` (removes dist/)

## Architecture

- **Runtime**: Bun-specific (uses Bun.build API)
- **Build target**: Bun runtime
- **CLI entry**: `bin/bundler.ts`
- **Main export**: `src/index.ts` exports the `build` function

## Structure

```text
src/
├── index.ts       # Main entry point, exports build function
├── bundler.ts     # Core bundler logic
├── plugin.ts      # Bun build plugin for Agentuity
└── file.ts        # File system utilities
bin/
└── bundler.ts     # CLI wrapper
```

## Code Style

- **Bun-specific** - Uses Bun.build, Bun.file, etc.
- **TypeScript** - All code is TypeScript
- **Async/await** - All I/O operations are async
- **Error handling** - Throw descriptive errors for missing files/directories

## Important Conventions

- **Entry points** - Scans `src/agents/`, `src/apis/`, `src/web/` for all `.ts`, `.tsx`, `.js`, `.jsx` files
- **Output directory** - Always outputs to `.agentuity/` in the project root
- **Bytecode** - Production builds use bytecode compilation (dev mode disables this)
- **Plugin system** - Uses custom Bun plugin (AgentuityBuilder) for special transformations
- **Version injection** - Injects bundler version as `process.env.AGENTUITY_CLOUD_SDK_VERSION`

## CLI Usage

```bash
bunx @agentuity/bundler --dir <project-dir> [--dev]
```

- `--dir` (required) - Project root directory
- `--dev` (optional) - Development mode (no bytecode, with source maps)

## Programmatic API

```typescript
import { build } from '@agentuity/bundler';

await build({
	rootDir: './my-project',
	dev: false,
});
```

## Testing

- Test by running against real Agentuity projects
- Verify output in `.agentuity/` directory
- Check that bytecode is generated in production mode
- Ensure source maps work in dev mode

## Publishing Checklist

1. Run `bun run build` to compile bundler itself
2. Test CLI with `bun bin/bundler.ts --dir <test-project>`
3. Verify `bin/bundler.ts` shebang is correct
4. This package has no dependencies on other @agentuity packages (can be published early)
