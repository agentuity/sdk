# Runtime Bootstrap Utility

## Problem

When running SDK test applications locally (integration-suite, cloud-deployment), they weren't respecting:

- Profile-specific `.env` files (`.env.local`, `.env.production`)
- Profile-specific config files (`agentuity.local.json`, `agentuity.production.json`)

This caused tests to fail because:

1. `AGENTUITY_SDK_KEY` wasn't loaded from `.env.local`
2. `AGENTUITY_REGION` wasn't set to `local` for local profile
3. Services tried to connect to production URLs instead of `*.agentuity.io`

## Solution

The `bootstrapRuntimeEnv()` function loads profile-aware configuration and environment variables **before** `createApp()` is called.

### What it does:

1. **Resolves active profile** via `loadConfig()`
   - Checks `AGENTUITY_PROFILE` env var
   - Reads `~/.config/agentuity/profile` file
   - Falls back to `production` profile

2. **Loads `.env` files** based on profile:
   - For `local` profile: `.env.local`, `.env.development`, `.env`
   - For `production` profile: `.env.production`, `.env`

3. **Sets environment variables**:
   - Only sets if not already defined (existing env wins)
   - For `local` profile: defaults `AGENTUITY_REGION=local`
   - Sets `AGENTUITY_PROFILE` to match active profile

4. **Loads project config**:
   - For `local` profile: `agentuity.local.json`
   - For `production` profile: `agentuity.json` or `agentuity.production.json`

### Usage

Call `bootstrapRuntimeEnv()` at the top of your `app.ts` **before** `createApp()`:

```ts
import { createApp } from '@agentuity/runtime';
import { bootstrapRuntimeEnv } from '@agentuity/cli';

// Bootstrap runtime environment based on active profile
await bootstrapRuntimeEnv();

// Now createApp() will use the correct env vars
const app = await createApp();
```

### Options

```ts
await bootstrapRuntimeEnv({
	projectDir: '/path/to/project', // default: process.cwd()
	profile: 'local', // override active profile
});
```

### Local Development Setup

To run tests locally with local services:

1. **Create local profile** (if not exists):

   ```bash
   cd ~/.config/agentuity
   touch local.yaml
   echo "name: local" > local.yaml
   ```

2. **Select local profile**:

   ```bash
   agentuity profile switch local
   # Or set env var:
   export AGENTUITY_PROFILE=local
   ```

3. **Create `.env.local`** in project root:

   ```bash
   AGENTUITY_SDK_KEY=your-sdk-key-here
   AGENTUITY_REGION=local  # Optional, auto-set for local profile
   ```

4. **(Optional) Create `agentuity.local.json`** for project-specific overrides:
   ```json
   {
   	"projectId": "proj_local_test",
   	"orgId": "org_local",
   	"region": "local"
   }
   ```

### How it works

The bootstrap process follows this precedence (highest to lowest):

1. **Explicit env vars** (from shell/CI) - always wins
2. **Profile-specific .env** (`.env.local` for local profile)
3. **Development/production .env** (`.env.development` or `.env.production`)
4. **Default .env** (`.env`)

For config files:

1. **Profile-specific config** (`agentuity.local.json` for local profile)
2. **Default config** (`agentuity.json`)

### Integration Points

This utility is used by:

- `sdk/apps/testing/integration-suite/app.ts`
- `sdk/apps/testing/cloud-deployment/app.ts`

It reuses existing infrastructure from the CLI:

- `loadConfig()` - Resolves active profile
- `loadProjectConfig()` - Loads profile-specific project config
- `getEnvFilePaths()` - Determines which .env files to load
- `readEnvFile()` - Parses .env files

### Design Decisions

**Why not embed in `createApp()`?**

- `createApp()` is a runtime primitive that should work in any environment
- CLI config and profile logic is Bun-specific
- Test harnesses can opt-in to this behavior without forcing it on all SDK users

**Why not auto-detect local vs production?**

- Profile system is the single source of truth
- `NODE_ENV` alone is insufficient (can be `development` in production)
- Region alone is insufficient (multiple regions, not just local vs cloud)
- Profile explicitly declares intent: "I want local services"

### Testing

To verify it works:

```bash
# Set local profile
export AGENTUITY_PROFILE=local

# Build and run
cd sdk/apps/testing/integration-suite
bun run build
cd .agentuity && bun run app.js

# Check logs for:
# [TEST-SUITE] Profile: local
# [TEST-SUITE] Region: local
```

Services should connect to `*.agentuity.io` instead of `*.agentuity.cloud`.
