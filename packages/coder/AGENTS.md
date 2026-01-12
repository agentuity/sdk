# Agent Guidelines for @agentuity/coder

## Package Overview

Open Code plugin providing a team of specialized AI agents with access to Agentuity's cloud platform.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Test**: `bun run test`
- **Clean**: `bun run clean`

## Architecture

- **Runtime**: Bun/Node compatible
- **Plugin target**: Open Code
- **Agents**: Lead, Scout, Builder, Reviewer, Memory, Expert

## Structure

```
src/
├── index.ts              # Plugin entrypoint
├── plugin/               # Open Code integration
├── agents/               # Agent definitions
├── orchestrator/         # Task execution engine
├── mcps/                 # Third-party MCP configs
├── services/             # Agentuity cloud adapters
├── tools/                # Custom tools
├── prompts/              # Agent system prompts
└── config/               # Configuration loading
```

## Code Conventions

- Follow existing SDK patterns
- Use Zod for schema validation
- Prompts are Markdown files in `src/prompts/`
- Cloud services are thin wrappers, not required by default
