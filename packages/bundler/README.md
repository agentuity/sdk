# @agentuity/bundler

Build tool for Agentuity applications.

## Installation

```bash
bun add -d @agentuity/bundler
```

## Overview

`@agentuity/bundler` is a specialized build tool for Agentuity projects that compiles agents, APIs, and web applications into optimized bundles.

## CLI Usage

### Via npx/bunx

```bash
bunx @agentuity/bundler --dir ./my-project
```

### Installed Globally

```bash
bun add -g @agentuity/bundler
agentuity-bundler --dir ./my-project
```

### In package.json

```json
{
	"scripts": {
		"build": "agentuity-bundler --dir .",
		"build:dev": "agentuity-bundler --dir . --dev"
	}
}
```

## Options

- `--dir <path>` - Root directory of your Agentuity project (required)
- `--dev` - Build in development mode (disables bytecode compilation, enables source maps)

## What It Does

The bundler:

1. Scans your project structure (`src/agents/`, `src/apis/`, `src/web/`)
2. Compiles TypeScript/JavaScript files
3. Bundles all code for the Bun runtime
4. Generates optimized output in `.agentuity/` directory
5. Creates bytecode for production builds (when `--dev` is not specified)
6. Copies configuration files (`agentuity.yaml`)

## Project Structure

The bundler expects your project to follow this structure:

```
my-project/
├── src/
│   ├── agents/     # Agent definitions (required)
│   ├── apis/       # API routes (optional)
│   └── web/        # Web application (optional)
├── app.ts          # Application entry point (required)
├── agentuity.yaml  # Configuration (optional)
└── package.json
```

## Output

Compiled files are placed in `.agentuity/`:

```
.agentuity/
├── app.js
├── package.json
├── agentuity.yaml
└── [bundled source files]
```

## Programmatic API

```typescript
import { build } from '@agentuity/bundler';

await build({
	rootDir: './my-project',
	dev: false,
});
```

## License

MIT
