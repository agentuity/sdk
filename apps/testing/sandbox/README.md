# Sandbox Test App

A simple standalone Bun app to test the `SandboxClient` from `@agentuity/server`.

## Usage

### Prerequisites

Set the required environment variables:

```bash
export AGENTUITY_SDK_KEY="your-api-key"
export AGENTUITY_REGION="local"  # or "usc" for production
```

Or use a `.env.local` file (Bun auto-loads it):

```bash
AGENTUITY_SDK_KEY=your-api-key
```

### Run

```bash
# Install dependencies
bun install

# Run the test
bun run start

# Or with specific region
AGENTUITY_REGION=local bun run start
```

### What it does

1. Creates a sandbox with 512Mi memory and 500m CPU
2. Gets sandbox info
3. Executes `echo "Hello from sandbox!"`
4. Executes `ls -la`
5. Executes `uname -a`
6. Destroys the sandbox

### Expected Output

```
🚀 Starting Sandbox Test...

Environment:
   AGENTUITY_SDK_KEY: ***bc73
   AGENTUITY_STREAM_URL: NOT SET (using default)
   AGENTUITY_REGION: local

📦 Creating sandbox...
✅ Sandbox created: sbx_abc123...
   Status: creating

📋 Getting sandbox info...
   ID: sbx_abc123...
   Status: idle

🔧 Executing command: echo "Hello from sandbox!"
   Exit code: N/A

🔧 Executing command: ls -la
   Exit code: N/A

🔧 Executing command: uname -a
   Exit code: N/A

🗑️  Destroying sandbox...
✅ Sandbox destroyed

✨ Sandbox test completed successfully!
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_SANDBOX_URL` | Override sandbox API URL | Auto-detected |
| `AGENTUITY_CATALYST_URL` | Override catalyst API URL | Auto-detected |
