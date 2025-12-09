# Agentuity VSCode Extension

Build, deploy, and manage AI agents with Agentuity directly from VSCode.

## Prerequisites

- [Agentuity CLI](https://agentuity.com/docs/cli) must be installed
- VSCode 1.90.0 or later

## Features

### Agent Explorer
View all agents in your Agentuity project in the sidebar.

### Data Explorer
Browse cloud data resources:
- **Key-Value** - View namespaces and keys
- **Object Store** - View buckets and objects
- **Vector** - View vector indexes

### Dev Server
Start, stop, and monitor the development server with status bar integration.

### Workbench Integration
Open the Agentuity Workbench in your browser with one click.

### AI Commands (for Coding Agents)
The extension exposes commands that AI coding tools (Claude Code, Cursor, Amp) can use:

```typescript
// Get AI capabilities as JSON
const capabilities = await vscode.commands.executeCommand('agentuity.getAiCapabilities');

// Get AI schema as JSON
const schema = await vscode.commands.executeCommand('agentuity.getAiSchema');
```

### Chat Participant
Use `@agentuity` in GitHub Copilot Chat to get help with your agents:

- "What agents are available?"
- "Show me the AI capabilities"
- "How do I get started?"

## Commands

| Command | Description |
|---------|-------------|
| `Agentuity: Login` | Login via CLI in terminal |
| `Agentuity: Logout` | Logout from Agentuity |
| `Agentuity: Who Am I?` | Show current user |
| `Agentuity: Start Dev Server` | Start the dev server |
| `Agentuity: Stop Dev Server` | Stop the dev server |
| `Agentuity: Open Workbench` | Open Workbench in browser |
| `Agentuity: Deploy` | Deploy to Agentuity Cloud |
| `Agentuity: Refresh` | Refresh auth and project state |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `agentuity.cliPath` | `""` | Custom path to CLI executable |
| `agentuity.devServer.port` | `3500` | Default dev server port |

## Development

### Prerequisites

1. **Agentuity CLI installed globally**: `bun install -g @agentuity/cli`
2. **Logged in to Agentuity**: `agentuity auth login`
3. **A test project**: The `apps/testing/auth-app` directory is a good test project

### Setup

```bash
# From the SDK root
cd packages/vscode
bun install
bun run compile
```

### Running the Extension Locally

1. Open the `packages/vscode` folder in VSCode (or the SDK root)
2. Press `F5` to launch the Extension Development Host
3. In the new VSCode window, open an Agentuity project folder (e.g., `apps/testing/auth-app`)
4. The Agentuity sidebar should appear with Agents, Deployments, Sessions, and Data panels

### Testing Features

**Agent Explorer**: Should list agents from your project after the project is detected.

**Data Explorer**: 
- Expand "Key-Value" to see namespaces and keys
- Expand "Object Store" to see buckets and objects
- Click on a key to view its contents

**Deployments & Sessions**: Lists recent deployments and sessions for your project.

**Dev Server**: Use Command Palette (`Cmd+Shift+P`) → "Agentuity: Start Dev Server"

**Deploy**: Use Command Palette → "Agentuity: Deploy" (runs in terminal)

### Build Commands

```bash
bun run build      # Compile the extension
bun run typecheck  # Run TypeScript type checking
bun run watch      # Watch mode for development
bun run clean      # Remove build artifacts
```

### Debugging

- View CLI output: Open the "Agentuity CLI" output channel in VSCode
- View extension logs: Open the "Agentuity" output channel
- If the extension fails to activate, check the "Extension Host" output channel

### Important Notes

- The extension requires the Agentuity CLI to be installed and accessible
- Project detection requires an `agentuity.json` file in the workspace root
- All CLI commands use `--json` flag for structured output
- External dependencies (`vscode`, `jsonc-parser`) are not bundled

## Publishing

```bash
bun run package  # Creates .vsix file
```

## License

MIT
