# Vector Test App

A simple standalone Bun app to test the `VectorClient` from `@agentuity/vector`.

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
```

### What it does

1. Creates a VectorClient instance
2. Upserts vector documents into a test namespace
3. Searches for similar vectors
4. Demonstrates basic vector operations
