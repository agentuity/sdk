# Generated Files - DO NOT EDIT

This directory contains auto-generated TypeScript files created by the Agentuity build system.

**These files are regenerated on every build.** Any manual changes will be overwritten.

## Generated Files

- `registry.ts` - Agent registry from `src/agent/**`
- `routes.ts` - Route registry from `src/api/**`
- `app.ts` - Application entry point
- `analytics-config.ts` - Web analytics configuration from `agentuity.json`
- `webanalytics.ts` - Web analytics injection and route registration
- `state.ts` - App state type (only generated when `setup()` returns state in `app.ts`)
- `router.ts` - Runtime wrapper with type augmentation (only generated when `setup()` returns state in `app.ts`)

## For Developers

Do not modify these files. Instead:
- Add/modify agents in `src/agent/`
- Add/modify routes in `src/api/`
- Configure app in `app.ts`

These files ARE version controlled to enable better tooling and type checking.
