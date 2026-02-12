# Generated Files - DO NOT EDIT

This directory contains auto-generated TypeScript files created by the Agentuity build system.

**These files are regenerated on every build.** Any manual changes will be overwritten.

## Generated Files

- `registry.ts` - Agent registry from `src/agent/**`
- `routes.ts` - Route registry from `src/api/**`
- `app.ts` - Application entry point
- `analytics-config.ts` - Web analytics configuration from `agentuity.json`
- `webanalytics.ts` - Web analytics injection and route registration
- `env.d.ts` - TypeScript types for environment variables from `.env` files
- `state.ts` - App state type (only generated when `setup()` returns state in `app.ts`)
- `router.ts` - Runtime wrapper with type augmentation (only generated when `setup()` returns state in `app.ts`)

## Environment Variable Types

The `env.d.ts` file provides TypeScript intellisense for your environment variables:

- **ProcessEnv**: All variables from your `.env` files are typed as `string`
- **ImportMetaEnv**: Only `VITE_*`, `AGENTUITY_PUBLIC_*`, and `PUBLIC_*` prefixed variables (for client-side use)

Files are merged based on build mode:
- **Development**: `.env.{profile}` → `.env.development` → `.env` (later files override)
- **Production**: `.env.{profile}` → `.env` → `.env.production` (later files override)

## For Developers

Do not modify these files. Instead:
- Add/modify agents in `src/agent/`
- Add/modify routes in `src/api/`
- Configure app in `app.ts`
- Add environment variables to `.env` files

These files ARE version controlled to enable better tooling and type checking.
