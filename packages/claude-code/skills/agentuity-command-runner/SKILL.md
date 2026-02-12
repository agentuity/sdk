---
name: agentuity-command-runner
description: When running lint, build, test, typecheck, format, clean, or install commands and need structured, actionable output. Activates when executing development commands and parsing their output into structured error reports with file locations, error classification, and deduplication.
version: 1.0.0
---

# Command Runner Reference

Reference for executing development commands and parsing output into structured, actionable summaries.

## Runtime Detection

Before running ANY command, detect the correct runtime:

### Detection Priority

1. **Agentuity project** (highest priority):
   - If `agentuity.json` or `.agentuity/` exists → **bun**
   - Agentuity projects are ALWAYS bun-only

2. **JavaScript/TypeScript lockfiles**:
   - `bun.lockb` → **bun**
   - `package-lock.json` → **npm**
   - `pnpm-lock.yaml` → **pnpm**
   - `yarn.lock` → **yarn**

3. **Other ecosystems**:
   - `go.mod` → **go**
   - `Cargo.toml` → **cargo** (Rust)
   - `pyproject.toml` → **uv** or **poetry**
   - `requirements.txt` → **pip**

## Command Patterns by Ecosystem

### JavaScript/TypeScript (bun/npm/pnpm/yarn)

| Task      | bun                 | npm                 | pnpm                 |
| --------- | ------------------- | ------------------- | -------------------- |
| install   | `bun install`       | `npm install`       | `pnpm install`       |
| build     | `bun run build`     | `npm run build`     | `pnpm run build`     |
| test      | `bun test`          | `npm test`          | `pnpm test`          |
| typecheck | `bun run typecheck` | `npm run typecheck` | `pnpm run typecheck` |
| lint      | `bun run lint`      | `npm run lint`      | `pnpm run lint`      |
| format    | `bun run format`    | `npm run format`    | `pnpm run format`    |
| clean     | `bun run clean`     | `npm run clean`     | `pnpm run clean`     |

### Go

| Task   | Command             |
| ------ | ------------------- |
| build  | `go build ./...`    |
| test   | `go test ./...`     |
| lint   | `golangci-lint run` |
| format | `go fmt ./...`      |

### Rust (cargo)

| Task   | Command        |
| ------ | -------------- |
| build  | `cargo build`  |
| test   | `cargo test`   |
| lint   | `cargo clippy` |
| format | `cargo fmt`    |

## Output Parsing Intelligence

### Error Extraction Rules

1. **Deduplicate** — Same error in multiple files? Report once with count
2. **Prioritize** — Errors before warnings
3. **Truncate** — Top 10 issues max (note if more exist)
4. **Extract locations** — file:line format when available
5. **Classify** — type error, syntax error, lint error, test failure

### Error Classification

| Type         | Signal Words                                    |
| ------------ | ----------------------------------------------- |
| Type Error   | "Type", "TS", "cannot assign", "not assignable" |
| Syntax Error | "Unexpected", "SyntaxError", "Parse error"      |
| Lint Error   | "eslint", "biome", "warning", "rule"            |
| Test Failure | "FAIL", "AssertionError", "expect", "assert"    |
| Build Error  | "Build failed", "Cannot find module"            |

### Location Extraction

Extract file:line from common formats:

- TypeScript: `src/foo.ts(10,5): error TS2322`
- ESLint: `src/foo.ts:10:5 error`
- Go: `./pkg/foo.go:10:5:`
- Rust: `--> src/main.rs:10:5`
- Python: `File "src/foo.py", line 10`

## Structured Output Format

```markdown
## [Task] Result: [PASSED | FAILED | WARNINGS]

**Runtime:** [bun | npm | pnpm | go | cargo | uv]
**Command:** `[exact command executed]`
**Duration:** [time in seconds]
**Exit Code:** [0 | non-zero]

### Errors ([count])

| File         | Line | Type | Message                                          |
| ------------ | ---- | ---- | ------------------------------------------------ |
| `src/foo.ts` | 45   | Type | Type 'string' is not assignable to type 'number' |

### Warnings ([count])

| File         | Line | Message           |
| ------------ | ---- | ----------------- |
| `src/baz.ts` | 8    | Unused import 'y' |

### Summary

[One sentence: what happened, what the calling agent should know]
```

## Execution Workflow

1. **Detect Runtime** — Check for agentuity.json, then lockfiles
2. **Discover or Use Explicit Command** — Auto-discover from package.json or use provided command
3. **Execute Command** — Capture stdout, stderr, exit code, duration
4. **Parse Output** — Extract and classify errors/warnings with file:line
5. **Return Structured Result** — Format using the template above
