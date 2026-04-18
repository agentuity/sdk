# Email Test App

A simple standalone Bun app to test the `EmailClient` from `@agentuity/email`.

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

1. Creates an EmailClient instance
2. Creates an email address
3. Sends an email
4. Demonstrates basic email operations
