<div align="center">
    <img src="https://raw.githubusercontent.com/agentuity/sdk/main/.github/Agentuity.png" alt="Agentuity" width="100"/> <br/>
    <strong>Build Agents, Not Infrastructure</strong> <br/>
<br />
<a href="https://npm.im/@agentuity/runtime"><img alt="NPM version" src="https://img.shields.io/npm/v/%40agentuity%2Fruntime.svg"></a>
<a href="https://npm.im/@agentuity/react"><img alt="NPM version" src="https://img.shields.io/npm/v/%40agentuity%2Freact.svg"></a>
<a href="https://npm.im/@agentuity/cli"><img alt="NPM version" src="https://img.shields.io/npm/v/%40agentuity%2Fcli.svg"></a>
<a href="https://github.com/agentuity/sdk/blob/main/README.md"><img alt="License" src="https://badgen.now.sh/badge/license/Apache-2.0"></a>
<a href="https://discord.gg/vtn3hgUfuc"><img alt="Join the community on Discord" src="https://img.shields.io/discord/1332974865371758646.svg?style=flat"></a>
</div>
<br />

# Agentuity TypeScript Monorepo

**Visit [https://agentuity.com](https://agentuity.com) to get started with Agentuity.**

TypeScript monorepo using Bun 1.3+ workspaces.

## Structure

- `packages/cli` - command line tools
- `packages/core` - Shared utilities
- `packages/react` - React package (browser)
- `packages/runtime` - Server-side package (Bun runtime)
- `packages/server` - Runtime-agnostic server utilities (Node.js & Bun)

## Setup

```bash
bun install
```

## Build

```bash
bun run build
```

## Typecheck

```bash
bun run typecheck
```

## Testing

Run the following to do a cycle of `lint`, `typecheck`, `format` and `test`:

```bash
bun all
```
