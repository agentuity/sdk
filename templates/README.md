# Agentuity Project Templates

This directory contains project templates used by the `@agentuity/cli` package to scaffold new Agentuity applications.

## Overview

Templates provide a starting point for new Agentuity projects. The CLI uses these templates when running `agentuity create <project-name>` to set up a complete, working project with example code, configuration, and best practices.

## Template Structure

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
- **directory**: Subdirectory name containing the template files

### Template Directory

Each template directory (e.g., `default/`) contains the complete file structure for a new project:

```
default/
├── src/
│   ├── agents/          # Example agent implementations
│   ├── apis/            # Custom API routes
│   └── web/             # React web application
├── AGENTS.md            # Agent guidelines and conventions
├── app.ts               # Application entry point
├── gitignore            # Renamed to .gitignore during setup
├── package.json         # Dependencies and scripts
├── README.md            # Project documentation
└── tsconfig.json        # TypeScript configuration
```

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

The CLI downloads/copies template files to the new project directory:

- **Local mode**: Copies files directly from the local template directory
- **GitHub mode**: Downloads tarball from GitHub and extracts specific template files

Relevant code: `packages/cli/src/cmd/project/download.ts`

### 4. Placeholder Replacement

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

### 5. Project Setup

After placeholder replacement, the CLI:

1. Installs dependencies with `bun install` (unless `--no-install`)
2. Builds the project with `bun run build` (unless `--no-build`)

Relevant code: `packages/cli/src/cmd/project/download.ts` (`setupProject()`)

### 6. Special Handling

- **gitignore**: The file is named `gitignore` in templates to prevent Git from ignoring it, then renamed to `.gitignore` during setup

## Creating a New Template

### 1. Create Template Directory

```bash
mkdir templates/my-template
```

### 2. Add Template Files

Create your project structure with:

- All necessary source files
- `package.json` with `{{PROJECT_NAME}}` placeholder
- `README.md` and `AGENTS.md` documentation
- `gitignore` file (not `.gitignore`)
- TypeScript configuration
- Example code and boilerplate

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

## Template Best Practices

1. **Use placeholders**: Always use `{{PROJECT_NAME}}` in user-facing text
2. **Include examples**: Provide working example code (agents, routes, components)
3. **Document everything**: Include comprehensive AGENTS.md and README.md files
4. **Follow conventions**: Match the code style and patterns in AGENTS.md
5. **Keep dependencies current**: Use `latest` for `@agentuity/*` packages
6. **Test thoroughly**: Verify the template works after `create`, `install`, and `build`

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
   - `download.ts` - Template download and setup
   - `create.ts` - Command definition
- **Template Manifest**: `templates/templates.json`
- **Default Template**: `templates/default/`
