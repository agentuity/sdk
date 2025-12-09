<div align="center">
    <img src=".github/GitHub.png" alt="Agentuity" width="1420"/> <br/>
<br />
<a href="https://npm.im/@agentuity/runtime"><img alt="NPM version" src="https://img.shields.io/npm/v/%40agentuity%2Fruntime.svg"></a>
<a href="https://github.com/agentuity/sdk/blob/main/README.md"><img alt="License" src="https://badgen.now.sh/badge/license/Apache-2.0"></a>
<a href="https://discord.gg/vtn3hgUfuc"><img alt="Join the community on Discord" src="https://img.shields.io/discord/1332974865371758646.svg?style=flat"></a>
</div>
<br />

> [!CAUTION]
> This repo contains the upcoming v1 production release and is not yet ready for production. Feedback very much welcome!

# Getting Started

Visit [https://agentuity.com](https://agentuity.com) to get started with Agentuity.

The fastest way to install and get started is to install the CLI:

```bash
curl -sSL https://v1.agentuity.sh | sh
```

# Documentation

Visit [https://agentuity.dev](https://agentuity.dev) to view the full documentation.

# Community

The Agentuity community can be found on [GitHub Discussions](https://github.com/agentuity/sdk/discussions) where you can discuss ideas, give feedback and share your projects with others.

To chat with other community members you can join the [Agentuity Discord server](https://discord.gg/agentuity).

# Development

## Structure

The structure of this mono repository:

- `packages/cli` - the command line tool
- `packages/core` - Shared utilities
- `packages/react` - React package for the Browser
- `packages/runtime` - Server-side package for the Agent runtime
- `packages/server` - Runtime-agnostic server utilities (Node.js & Bun)
- `packages/workbench` - Workbench UI component
- `packages/schema` - Schema validation library

Each package is its own published npm package but all packages are versioned and published together.

## Setup

```bash
bun install
```

## Build

```bash
bun run build
```

## Testing

Run the following to do a cycle of `lint`, `typecheck`, `format` and `test`:

```bash
bun all
```

For development workflow verification, ensure all commands run successfully before creating a PR.

## Linking to External Projects

To use the SDK in development mode with an existing project outside this repo:

```bash
./scripts/link-local.sh /path/to/your/project
```

This script builds all packages, creates tarballs, and installs them in your target project. After linking, run `bun run build` or `bun run dev` in your project to rebuild with the local SDK changes.

# LICENSE

See the [LICENSE](./LICENSE.md) for more information about the license to this project. The code is licensed under the Apache-2 License.
