# Agentuity Project Templates

This directory contains project templates used by the `@agentuity/cli` package to scaffold new Agentuity applications.

## Overview

Templates provide a starting point for new Agentuity projects. The CLI uses these templates when running `agentuity create <project-name>` to set up a complete, working project with example code, configuration, and best practices.

## Template Architecture

### Base + Overlay System

Templates use a **base + overlay** architecture to reduce duplication and simplify maintenance:

1. **`_base/`** - Contains all common files shared across templates (app.ts, tsconfig.json, React components, etc.)
2. **Template overlays** (e.g., `openai/`, `groq/`) - Contain only template-specific files that differ from the base

When creating a project, the CLI:

1. Copies all files from `_base/` to the destination
2. Copies overlay files on top (overlay wins on conflicts)
3. Merges `package.overlay.json` dependencies into the base `package.json`

### Directory Structure

```
templates/
├── _base/                    # Base template (shared files)
│   ├── src/
│   │   ├── agent/hello/     # Default agent implementation
│   │   ├── api/             # API routes
│   │   └── web/             # React web application
│   ├── AGENTS.md
│   ├── README.md
│   ├── agentuity.config.ts
│   ├── app.ts
│   ├── gitignore
│   ├── package.json
│   └── tsconfig.json
├── default/                  # Default template (empty overlay)
│   └── .gitkeep
├── openai/                   # OpenAI SDK template
│   ├── package.overlay.json  # Additional dependencies
│   └── src/agent/hello/agent.ts
├── groq/                     # Groq SDK template
│   ├── package.overlay.json
│   └── src/agent/hello/agent.ts
├── tailwind/                 # Tailwind CSS template
│   ├── package.overlay.json
│   ├── agentuity.config.ts   # Custom build config
│   └── src/web/index.html    # Modified HTML
└── templates.json            # Template manifest
```

### Manifest File

The `templates.json` file defines all available templates:

```json
{
	"templates": [
		{
			"id": "default",
			"name": "Default Template",
			"description": "A basic Agentuity project with React UI and example agents",
			"directory": "default"
		}
	]
}
```

Each template entry contains:

- **id**: Unique identifier used by the CLI
- **name**: Display name shown to users
- **description**: Brief explanation of what the template includes
- **directory**: Subdirectory name containing the overlay files

## How the CLI Uses Templates

### 1. Template Discovery

The CLI fetches available templates from either:

- **Local directory**: For development/testing (`--template-dir` option)
- **GitHub repository**: Production use from `agentuity/sdk` repository

Relevant code: `packages/cli/src/cmd/project/templates.ts`

### 2. Template Selection

When running `agentuity create`, users can:

- Select from available templates interactively
- Specify a template with `--template <id>`
- Default to the first available template

Relevant code: `packages/cli/src/cmd/project/template-flow.ts`

### 3. Template Download

The CLI downloads/copies template files using the base + overlay system:

1. Copy all files from `_base/` directory
2. Copy overlay files from the selected template directory (overlay wins on conflicts)
3. Merge `package.overlay.json` into `package.json` if present

Relevant code: `packages/cli/src/cmd/project/download.ts`

### 4. Package.json Merging

If a template has a `package.overlay.json` file, its contents are merged into the base `package.json`:

```json
// package.overlay.json (in template overlay)
{
	"dependencies": {
		"openai": "latest"
	}
}
```

The merge performs a shallow merge of:

- `dependencies` (overlay wins on conflicts)
- `devDependencies` (overlay wins on conflicts)
- `scripts` (overlay wins on conflicts)

### 5. Placeholder Replacement

After downloading, the CLI replaces template placeholders with actual values:

| Placeholder                  | Replaced With               | Files Affected                           |
| ---------------------------- | --------------------------- | ---------------------------------------- |
| `{{PROJECT_NAME}}`           | User's project name         | `package.json`, `README.md`, `AGENTS.md` |
| `"name": "{{PROJECT_NAME}}"` | Directory name (kebab-case) | `package.json` only                      |

**Example:**

```json
// Before (in template)
{
  "name": "{{PROJECT_NAME}}"
}

// After (in created project with name "My App")
{
  "name": "my-app"
}
```

Relevant code: `packages/cli/src/cmd/project/download.ts` (`replaceInFiles()`)

### 6. Project Setup

After placeholder replacement, the CLI:

1. Installs dependencies with `bun install` (unless `--no-install`)
2. Runs optional `_setup.ts` script if present (then deletes it)
3. Builds the project with `bun run build` (unless `--no-build`)

Relevant code: `packages/cli/src/cmd/project/download.ts` (`setupProject()`)

### 7. Template Setup Script

Templates can include an optional `_setup.ts` script that runs after `bun install` but before `bun run build`. This allows templates to perform custom setup logic such as:

- Generating configuration files
- Running code generators
- Setting up environment-specific files
- Any other post-install initialization

The script is automatically deleted after execution (whether it succeeds or fails), so it won't be included in the final project.

**Example `_setup.ts`:**

```typescript
// _setup.ts - This script runs after bun install and is then deleted
import { writeFileSync } from 'fs';

// Generate a config file based on environment
writeFileSync('.env.local', 'EXAMPLE_VAR=value\n');

console.log('Setup complete!');
```

### 8. Special Handling

- **gitignore**: The file is named `gitignore` in templates to prevent Git from ignoring it, then renamed to `.gitignore` during setup
- **.gitkeep**: These files are skipped during copy (they're just placeholders for empty directories)
- **package.overlay.json**: This file is not copied directly; its contents are merged into `package.json`
- **\_setup.ts**: This script runs after `bun install` and is deleted afterward

## Creating a New Template

### 1. Create Template Directory

```bash
mkdir templates/my-template
```

### 2. Add Overlay Files

Only add files that differ from the base template:

- **`package.overlay.json`** - Additional dependencies to merge
- **`src/agent/hello/agent.ts`** - Custom agent implementation (if different)
- **`agentuity.config.ts`** - Custom build configuration (if needed)
- **Any other files** - Will override base files with the same path

Example `package.overlay.json`:

```json
{
	"dependencies": {
		"my-sdk": "latest"
	},
	"devDependencies": {
		"my-dev-tool": "^1.0.0"
	}
}
```

### 3. Update Manifest

Add your template to `templates.json`:

```json
{
	"templates": [
		{
			"id": "my-template",
			"name": "My Custom Template",
			"description": "Description of what this template provides",
			"directory": "my-template"
		}
	]
}
```

### 4. Test Locally

Test your template with the local template directory option:

```bash
agentuity create my-project \
  --template my-template \
  --template-dir ./templates
```

## Modifying the Base Template

When modifying files in `_base/`, remember that changes affect ALL templates. Only add files to `_base/` that should be shared across all templates.

Common files in `_base/`:

- `app.ts` - Application entry point with workbench enabled
- `tsconfig.json` - TypeScript configuration
- `gitignore` - Git ignore patterns
- `AGENTS.md` - Agent guidelines
- `README.md` - Project documentation template
- `agentuity.config.ts` - Default build configuration
- `package.json` - Base dependencies
- `src/agent/hello/` - Default agent implementation
- `src/api/index.ts` - API routes
- `src/web/` - React web application

## Template Best Practices

1. **Minimize overlay files**: Only include files that truly differ from the base
2. **Use package.overlay.json**: Don't duplicate the entire package.json; only specify additional dependencies
3. **Include examples**: Provide working example code that showcases the template's SDK/framework
4. **Document differences**: If your template has special requirements, document them
5. **Test thoroughly**: Verify the template works after `create`, `install`, and `build`

## Files That Support Placeholders

Currently, only these files have placeholders automatically replaced:

- `package.json`
- `README.md`
- `AGENTS.md`

To add more files, modify the `replaceInFiles()` function in `packages/cli/src/cmd/project/download.ts`.

## Available Placeholders

| Placeholder        | Description                | Example  |
| ------------------ | -------------------------- | -------- |
| `{{PROJECT_NAME}}` | User-provided project name | "My App" |

The directory name (used for package.json `name` field) is automatically generated as a kebab-case version of the project name.

## CLI Commands for Templates

```bash
# Create project with default template
agentuity create my-project

# Create with specific template
agentuity create my-project --template default

# Create from local templates (development)
agentuity create my-project --template-dir ./templates

# Create from specific branch (testing)
agentuity create my-project --template-branch dev

# Skip install and build steps
agentuity create my-project --no-install --no-build
```

## Related Files

- **CLI Template Code**: `packages/cli/src/cmd/project/`
   - `templates.ts` - Template loading and fetching
   - `template-flow.ts` - User interaction flow
   - `download.ts` - Template download and setup (base + overlay merging)
   - `create.ts` - Command definition
- **Template Manifest**: `templates/templates.json`
- **Base Template**: `templates/_base/`
- **Template Overlays**: `templates/default/`, `templates/openai/`, etc.
