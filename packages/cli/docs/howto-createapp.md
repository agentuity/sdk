# How to Test the `agentuity create` Command

This guide provides detailed instructions for testing project creation flows locally during development.

## Overview

The `agentuity create` command supports two flows:

1. **CLI Flow**: User runs `agentuity create` → CLI collects info → runs `bun create agentuity`
2. **Direct Flow**: User runs `bun create agentuity my-project` → runs postinstall → calls CLI

## Testing Approaches

### Approach 1: Simulation Script (Recommended for Full Testing)

**Best for:** Complete end-to-end testing including build and run

```bash
cd packages/cli
bun run simulate-create my-test-project ../../apps
```

**What it does:**

1. Copies template from `apps/create-agentuity/`
2. Creates project in `apps/my-test-project/` (within monorepo)
3. Runs `bun install` (workspace: deps resolve correctly)
4. Runs postinstall hooks (setup + build)
5. Creates fully functional project

**Benefits:**

- ✅ Full build and run testing
- ✅ Test with actual workspace dependencies
- ✅ No publishing to npm required
- ✅ Simulates exact `bun create` behavior
- ✅ Can test dev server with `cd apps/my-test-project && bun run dev`

**After testing, cleanup:**

```bash
rm -rf ../../apps/my-test-project
```

### Approach 2: Dev Template (For External Flow Testing)

**Best for:** Testing creation flow as users will experience it (outside monorepo)

**Setup (one-time):**

```bash
cd packages/cli
bun run setup-dev-template
```

This creates `~/.bun-create/agentuity-dev/` with the template.

**Test CLI Flow:**

```bash
bun bin/cli.ts create --name "Test Project" --dir /tmp --dev --confirm
```

**Test Direct bun create:**

```bash
cd /tmp
bun create agentuity-dev my-test-project
```

**Limitations:**

- ⚠️ Created projects **cannot** build or run (missing @agentuity deps outside monorepo)
- ✅ Can test: creation flow, name transform, file updates, setup.ts removal
- ❌ Cannot test: build, dev server, TypeScript compilation

**For full testing, use Approach 1 (simulation script) instead.**

## Detailed Flow Documentation

### CLI Flow (`agentuity create`)

**User runs:**

```bash
agentuity create --name "My Project" --dir /tmp
```

**What happens:**

1. **CLI collects information**
   - Prompts for project name if not provided
   - Validates name (2-64 chars, any reasonable value)
   - Transforms to directory-friendly (e.g., "My Project!" → "my-project")
   - Checks if target directory exists

2. **CLI runs bun create**
   - Executes: `bun create agentuity <projectDirName>`
   - With `--dev` flag: `bun create agentuity-dev <projectDirName>`

3. **Bun copies template**
   - Copies from npm package or `~/.bun-create/agentuity-dev/`
   - Creates project directory

4. **Bun runs install**
   - `bun install` in project directory
   - Installs all dependencies

5. **Postinstall hooks execute**
   - Runs: `agentuity create --from-bun-create --no-log-prefix`
   - Runs: `bun run build`

6. **CLI performs setup** (via `--from-bun-create`)
   - Reads project name from package.json
   - Removes bun-create section, adds `private: true`
   - Replaces `{{PROJECT_NAME}}` in README.md
   - Replaces `{{PROJECT_NAME}}` in AGENTS.md
   - Removes setup.ts

7. **Build runs**
   - Bundles application
   - Creates `.agentuity/app.js`

### Direct `bun create` Flow

**User runs:**

```bash
bun create agentuity my-project
```

**What happens:**
1-7. Same as CLI flow (steps 3-7 above)

## Verification Checklist

After creating a project, verify:

### ✅ Project Structure

```bash
ls -la <project-directory>
```

Expected:

- `package.json`, `README.md`, `AGENTS.md`, `app.ts`, `src/` ✓
- `.agentuity/` (if built) ✓
- `node_modules/` ✓
- **No** `setup.ts` ✓

### ✅ package.json Updates

```bash
cat <project-directory>/package.json | jq '.name, .private, .["bun-create"]'
```

Expected:

- `name`: `"project-name"` ✓
- `private`: `true` ✓
- `bun-create`: `null` (removed) ✓

### ✅ Template Replacements

```bash
head -1 <project-directory>/README.md
head -1 <project-directory>/AGENTS.md
```

Expected:

- README: `# project-name` (not `{{PROJECT_NAME}}`) ✓
- AGENTS.md: `# Agent Guidelines for project-name` ✓

### ✅ Build Output (Simulation Script Only)

```bash
ls <project-directory>/.agentuity/
```

Expected: `app.js`, `package.json` ✓

### ✅ Dev Server (Simulation Script Only)

```bash
cd <project-directory>
bun run dev
```

Expected: Server starts, visit `http://localhost:3000` ✓

## Troubleshooting

### Legacy CLI Interference

**Error:** Old CLI commands appear or `bunx` shows wrong CLI

**Solution:** Remove legacy CLI

```bash
brew uninstall agentuity
# Or check: which agentuity
```

The new CLI will detect and block if legacy CLI exists.

### Template Not Found

**Error:** `template "agentuity-dev" not found`

**Solution:**

```bash
cd packages/cli
bun run setup-dev-template
```

### Workspace Dependencies Fail (Dev Template)

**Error:** `Workspace dependency "@agentuity/core" not found`

**This is expected** - dev template can't build outside monorepo.

**Solution:** Use simulation script instead:

```bash
bun run simulate-create my-project ../../apps
```

### Simulation Script: Directory Already Exists

**Error:** `Directory already exists`

**Solution:** Remove it first

```bash
rm -rf ../../apps/my-test-project
bun run simulate-create my-test-project ../../apps
```

## How the Templates Work

### Production Template (apps/create-agentuity)

Used when publishing to npm:

```json
{
	"scripts": {
		"build": "agentuity bundle --dir .",
		"dev": "agentuity dev --dir ."
	},
	"dependencies": {
		"@agentuity/core": "workspace:*",
		"@agentuity/runtime": "workspace:*"
	},
	"devDependencies": {
		"@agentuity/cli": "workspace:*"
	}
}
```

- Uses `agentuity` command (found in node_modules/.bin)
- CLI is a devDependency (self-contained)
- `workspace:*` replaced with real versions when published

### Key Implementation Details

**Why CLI is a devDependency:**

- Each project has its own CLI version
- No global install needed
- `agentuity` command works via node_modules/.bin
- Version pinning per project

**Postinstall command format:**

```json
"bun-create": {
  "postinstall": [
    "agentuity create --from-bun-create --no-log-prefix",
    "bun run build"
  ]
}
```

- Uses `agentuity` directly (no `bun` prefix needed)
- `bun create` wraps with `bun run` automatically
- `--no-log-prefix` for clean output

**The `--from-bun-create` flag:**

- Non-interactive mode
- Reads name from package.json
- Uses process.cwd() as project directory
- Skips bun install (already done)
- Just performs setup tasks

## Recommended Testing Workflow

Before publishing to npm:

1. **Test in monorepo** (full e2e):

   ```bash
   bun run simulate-create test-full-flow ../../apps
   cd ../../apps/test-full-flow
   bun run dev
   # Verify app works at http://localhost:3000
   rm -rf ../../apps/test-full-flow
   ```

2. **Test creation flow** (external):

   ```bash
   bun run setup-dev-template
   bun bin/cli.ts create --name "Test External" --dir /tmp --dev --confirm
   # Verify files updated correctly
   rm -rf /tmp/test-external
   ```

3. **Run integration tests**:
   ```bash
   bun run test
   ```

All tests should pass before publishing!

## Production Testing

After publishing to npm:

```bash
# Test with published packages
agentuity create --name "Production Test"
```

This uses the real published `create-agentuity` package from npm.
