# KeyValue Test App

A simple standalone Bun app to test the `KeyValueClient` from `@agentuity/keyvalue`.

## Usage

### Prerequisites

Set the required environment variables:

```bash
export AGENTUITY_SDK_KEY="your-api-key"
export AGENTUITY_REGION="usc"  # or "local" for development
```

### Run

```bash
bun install
bun run start
```

### What it does

1. Sets a key-value pair
2. Gets the value back
3. Deletes the key
4. Lists namespaces