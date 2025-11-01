# Development Notes

## Version Check Bypass

When developing locally, the CLI may encounter version check errors from the API. There are multiple ways to bypass this check (in priority order):

### Priority Order:

1. **CLI Flag** (highest): `--skip-version-check`
2. **Environment Variable**: `AGENTUITY_SKIP_VERSION_CHECK=1`
3. **Config/Profile Override**: `overrides.skip_version_check: true` in YAML
4. **Auto-detection** (lowest): Versions `dev` or `0.0.x`

### Examples:

```bash
# Auto-skip (version is 0.0.5)
bun bin/cli.ts auth login

# Force skip with CLI flag
bun bin/cli.ts --skip-version-check auth login

# Force skip with env var
AGENTUITY_SKIP_VERSION_CHECK=1 bun bin/cli.ts auth login

# Skip via profile config
echo 'name: "dev"
overrides:
  skip_version_check: true' > ~/.config/agentuity/dev.yaml
bun bin/cli.ts profile use dev
bun bin/cli.ts auth login
```

### Limitations:

The skip only prevents the CLI from showing upgrade errors. If the API server enforces version checks server-side (HTTP 409), the request will still fail. This is expected behavior.

## Testing Against Local API

To test against a local API server, use profile overrides:

1. Create a dev profile: `bun bin/cli.ts profile create dev`
2. Edit `~/.config/agentuity/dev.yaml`:
   ```yaml
   name: 'dev'
   overrides:
      api_url: http://localhost:3500
      app_url: http://localhost:5173
   ```
3. Switch to dev profile: `bun bin/cli.ts profile use dev`

## Debug Mode

Enable detailed error logging:

```bash
DEBUG=1 bun bin/cli.ts auth login
```

This shows:

- Request URL and method
- Request headers
- Response status
- Response body
