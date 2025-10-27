# Profile Management

The profile command allows you to manage multiple configuration profiles for different environments (production, staging, local development, etc.).

## How It Works

Profiles are YAML files stored in `~/.config/agentuity/` that contain a `name` field. The CLI maintains a `profile` file in the same directory that stores the path to the currently selected profile.

When you run the CLI, it automatically loads the active profile's configuration.

## Commands

### `profile show` (alias: `current`)

Show the configuration of the currently active profile.

```bash
agentuity profile show
agentuity profile current
```

Example output:

```
[INFO] Profile: /Users/username/.config/agentuity/production.yaml

name: production
auth:
    api_key: ck_...
    user_id: user_...
overrides:
    api_url: "https://api.agentuity.com"
```

### `profile list` (alias: `ls`)

Lists all available profiles. The currently active profile is marked with a bullet (`•`).

```bash
agentuity profile list
```

Example output:

```
[INFO] Available profiles:
[INFO] • production      agentuity/production.yaml
[INFO]   local           agentuity/local.yaml
```

### `profile use [name]` (alias: `select`)

Switch to a different profile by name. If no name is provided, shows the current profile and available options.

```bash
# Switch to a specific profile
agentuity profile use local

# Show current profile
agentuity profile use
```

## Profile File Format

Each profile is a YAML file with at minimum a `name` field:

```yaml
name: 'production'
# other configuration...
```

The `name` field is extracted using the regex: `/\bname:\s+["']?([\w-_]+)["']?/`

## Implementation Details

- Profile selection is stored in `~/.config/agentuity/profile`
- Profile files must have `.yaml` extension
- Profile names must match: `^[\w-_]{3,}$` (3+ chars, alphanumeric, dashes, underscores)
- The config loader (`loadConfig()`) automatically uses the active profile
- If no profile is selected or the file doesn't exist, falls back to `config.yaml`
