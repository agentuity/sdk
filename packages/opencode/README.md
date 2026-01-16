# @agentuity/opencode

An Open Code plugin providing a team of specialized AI agents with access to Agentuity cloud services and SDK expertise.

## Installation

```bash
agentuity ai opencode install
```

## Usage

In Open Code, use slash commands or `@mention` agents directly:

```
/agentuity-coder implement dark mode for settings page
/agentuity-cloud list all my KV namespaces
/agentuity-sandbox run bun test in a sandbox
```

## Commands

| Command                  | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `/agentuity-coder`       | Run tasks with the full agent team (Lead orchestrates) |
| `/agentuity-cloud`       | ☁️ Interact with any Agentuity cloud service           |
| `/agentuity-sandbox`     | 🏖️ Run code in isolated sandbox environments           |
| `/agentuity-memory-save` | Save session context to memory                         |

### Cloud Services via `/agentuity-cloud`

The Expert agent can operate any `agentuity cloud` subcommand:

| Service         | CLI                          | Examples                           |
| --------------- | ---------------------------- | ---------------------------------- |
| **KV**          | `agentuity cloud kv`         | `list namespaces`, `set key value` |
| **Storage**     | `agentuity cloud storage`    | `upload file`, `list buckets`      |
| **Vector**      | `agentuity cloud vector`     | `search for auth patterns`         |
| **Sandbox**     | `agentuity cloud sandbox`    | `run tests`, `create environment`  |
| **Database**    | `agentuity cloud db`         | `create table`, `run SQL`          |
| **SSH**         | `agentuity cloud ssh`        | `connect to deployment`            |
| **Deployments** | `agentuity cloud deployment` | `list`, `inspect`                  |
| **Agents**      | `agentuity cloud agent`      | `list`, `inspect`                  |
| **Sessions**    | `agentuity cloud session`    | `list`, `inspect`                  |
| **Threads**     | `agentuity cloud thread`     | `list`, `inspect`                  |

## Agent Team

| Agent        | Role                                            |
| ------------ | ----------------------------------------------- |
| **Lead**     | Orchestrates tasks, delegates to team           |
| **Scout**    | Explores codebases, finds patterns (read-only)  |
| **Builder**  | Implements features, runs tests, uses sandboxes |
| **Reviewer** | Reviews code, catches issues, applies fixes     |
| **Memory**   | Maintains context via KV/Vector storage         |
| **Expert**   | CLI, SDK, and cloud services specialist         |

## Security

Sensitive CLI commands are blocked by default:

- `agentuity cloud secrets` / `secret`
- `agentuity cloud apikey`
- `agentuity auth token`

Configure in your Agentuity profile under `coder.blockedCommands`.

## Recommended MCP Servers

Add to your `opencode.json` for enhanced Scout/Expert capabilities:

```jsonc
{
	"mcp": {
		"context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" },
		"grep_app": { "type": "remote", "url": "https://mcp.grep.app" },
	},
}
```

| MCP          | Purpose             | Free Tier     |
| ------------ | ------------------- | ------------- |
| **context7** | Library docs lookup | 500 req/month |
| **grep_app** | GitHub code search  | Unlimited     |

## Local Development

When developing the opencode package locally, configure OpenCode to use your local build.

Edit `~/.config/opencode/opencode.json` to point to your local package:

```jsonc
{
	"$schema": "https://opencode.ai/config.json",
	"plugin": ["/path/to/agentuity/sdk/packages/opencode"],
}
```

Then build and restart OpenCode:

```bash
cd packages/opencode
bun run build
```

To revert to the published npm package, run `agentuity ai opencode install` to reset the plugin path to `@agentuity/opencode`.

## Resources

- SDK: https://github.com/agentuity/sdk
- Docs: https://agentuity.dev/
