# Alpine Linux Support

## Current Status

❌ **Alpine Linux is NOT supported** due to Bun bug with musl `--compile`

## The Problem

Bun's `bun build --compile` produces **corrupted binaries on musl** for complex projects:

- Simple scripts work fine
- Large projects (like Agentuity CLI) produce 100MB files filled with zeros
- The output file shows as "data" instead of ELF executable
- This appears to be a Bun bug specific to large/complex musl compilations

## What We Tried

1. ✅ Bun musl runtime works perfectly
2. ✅ Simple `--compile` test scripts work
3. ❌ Full CLI `--compile` produces corrupted zero-filled binaries
4. ❌ gcompat doesn't help (relocation type 37 incompatibility)

## Installation Behavior

The install script detects Alpine and exits immediately:

```bash
curl -fsSL https://agentuity.sh/install | sh
```

Output:

```
╭────────────────────────────────────────────────────────╮
│  Alpine Linux / musl is NOT currently supported     │
╰────────────────────────────────────────────────────────╯

Bun's --compile produces corrupted binaries on musl (known bug)
Use a glibc distro: Ubuntu, Debian, Fedora, Amazon Linux

Installation aborted (Alpine Linux not supported)
```

## Workaround

Use a glibc-based distribution or run Agentuity in a Docker container with Ubuntu base:

```dockerfile
FROM ubuntu:latest
RUN curl -fsSL https://agentuity.sh/install | sh -s -- -y
```

## Root Cause Analysis

Confirmed behavior through testing:

- **Simple test**: `bun build hello.ts --compile` → Valid ELF executable ✅
- **Full CLI**: `bun build bin/cli.ts --compile` → 100MB zero-filled file ❌

This is a **Bun bug** when compiling large/complex TypeScript projects on musl.

## Upstream Issue

This should be reported to Bun: https://github.com/oven-sh/bun/issues

Until fixed, Alpine Linux users must use glibc-based distributions.
