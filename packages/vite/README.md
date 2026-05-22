# @agentuity/vite

Vite plugin for the Agentuity public-URL devmode tunnel.

When `agentuity dev --public` is active, the CLI exports
`AGENTUITY_DEVMODE_HOSTNAME` so this plugin can configure Vite for the
gravity tunnel: it adds the public hostname to `server.allowedHosts`
and points `server.hmr` at `wss://<hostname>:443` so HMR works for
users browsing the public URL.

The plugin is a no-op when the env var isn't set, so it's safe to
keep in `vite.config.ts` permanently.

## Install

```bash
bun add -d @agentuity/vite
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import agentuity from '@agentuity/vite';

export default defineConfig({
  plugins: [agentuity()],
});
```

For SvelteKit / Astro / similar — the plugin works in any Vite-based
config; just add it to the `plugins` array.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `hostname` | `string` | `process.env.AGENTUITY_DEVMODE_HOSTNAME` | Override the public hostname the plugin reacts to. Useful for testing. |
