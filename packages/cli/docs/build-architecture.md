# CLI Build Architecture

The CLI uses a hybrid Vite + Bun build system for production builds and development.

## Production Builds (`agentuity build`)

### 1. Client Assets (Vite)

- **Input**: `src/web/index.html` + React components
- **Output**: `.agentuity/client/` with manifest
- **CDN support**: For production deployments
- **Environment variables**: `VITE_*`, `AGENTUITY_PUBLIC_*`, `PUBLIC_*`

### 2. Workbench (Vite)

- **Input**: `.agentuity/workbench-src/` (generated)
- **Output**: `.agentuity/workbench/` with manifest
- **Base path**: Configured workbench route

### 3. Server Bundle (Bun.build)

- **Input**: `src/generated/app.ts`
- **Output**: `.agentuity/app.js`
- **Externals**: Heavy runtime deps (bun, fsevents, sharp, ws, etc.)
- **Minification**: Controlled by `--dev` flag

## Development Server (`agentuity dev`)

Single Bun server + Vite asset server architecture:

### Bun Server (port 3500)

- Handles ALL HTTP + WebSocket requests
- Routes API calls, serves workbench
- Proxies frontend assets to Vite
- Uses native Bun WebSocket support (`hono/bun`)

### Vite Asset Server (dynamic port, typically 5173)

- HMR and React Fast Refresh ONLY
- Asset transformation (TypeScript, JSX, CSS)
- Browser never connects directly to Vite
- Proxied through Bun server

## Build Utilities

| Utility                  | Purpose                                |
| ------------------------ | -------------------------------------- |
| `bun-version-checker.ts` | Enforces minimum Bun version (>=1.3.3) |
| `dependency-checker.ts`  | Auto-upgrades `@agentuity/*` packages  |
| `metadata-generator.ts`  | Creates `agentuity.metadata.json`      |
| `agent-discovery.ts`     | AST-based agent discovery              |
| `route-discovery.ts`     | AST-based route discovery              |
| `registry-generator.ts`  | Generates type-safe registries         |

## Build Flags

- `--dev` - Development build (no minification, inline sourcemaps, faster)
- `--skipTypeCheck` - Skip TypeScript validation after build
- `--outdir` - Custom output directory (default: `.agentuity`)

## Testing the CLI

### Manual Testing

```bash
bun bin/cli.ts [command]
bun bin/cli.ts --log-level=debug [command]
bun bin/cli.ts --config=/path/to/production.yaml [command]
```

### Test Suite

| Script                 | Description                         |
| ---------------------- | ----------------------------------- |
| `test:create`          | Integration test for create command |
| `test:bundled-create`  | Tests bundled executable            |
| `test:exit-codes`      | Tests CLI exit codes                |
| `test:response-schema` | Tests response schema validation    |
| `test:batch`           | Tests batch reporting               |
| `test:envelope`        | Tests response envelope             |

### Testing Bundled Executable

```bash
# Build executable for your platform
./scripts/build-executables.ts --skip-sign --platform=darwin-arm64

# Run bundled create test
bun test:bundled-create
```

## Version Check Bypass (Development Only)

Priority order:

1. CLI flag: `--skip-version-check`
2. Environment: `AGENTUITY_SKIP_VERSION_CHECK=1`
3. Config: `skip_version_check: true` in profile overrides
4. Auto-detection: Versions `0.0.x` or `dev` automatically skipped
