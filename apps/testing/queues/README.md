# Queue Test App

A standalone Bun app to test the Queue API from `@agentuity/server`.

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
AGENTUITY_REGION=local
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

1. Creates a worker queue with custom settings
2. Gets queue info
3. Lists all queues
4. Publishes a single message with metadata
5. Batch publishes 3 messages
6. Lists messages in the queue
7. Receives and acknowledges a message
8. Receives and nacks (returns) a message
9. Pauses and resumes the queue
10.   Deletes the queue

### Expected Output

```
🚀 Starting Queue API Test...

Environment:
   AGENTUITY_SDK_KEY: ***bc73
   AGENTUITY_REGION: local
   Catalyst URL: https://catalyst.agentuity.io

📦 Creating worker queue...
✅ Queue created: test-queue-1234567890
   ID: que_abc123...
   Type: worker

📋 Getting queue info...
   Name: test-queue-1234567890
   Type: worker
   Messages: 0

📜 Listing queues...
   Found 5 queues (total: 5)
   Test queue in list: Yes

📤 Publishing single message...
✅ Message published: msg_abc123...
   Offset: 0

📤 Batch publishing 3 messages...
✅ Batch published 3 messages

📜 Listing messages...
   Found 4 messages

📥 Receiving message...
✅ Received message: msg_abc123...
   Payload: {"task":"process-order","orderId":123}...
   State: leased
✅ Acknowledging message...
   Message acknowledged

📥 Receiving another message...
✅ Received message: msg_def456...
↩️  Returning message to queue (nack)...
   Message returned to queue

⏸️  Pausing queue...
   Paused at: 2024-01-15T12:00:00.000Z

▶️  Resuming queue...
   Paused at: null (resumed)

🗑️  Deleting queue...
✅ Queue deleted

✨ Queue API test completed successfully!
```

## Environment Variables

| Variable                 | Description                | Default       |
| ------------------------ | -------------------------- | ------------- |
| `AGENTUITY_SDK_KEY`      | API key for authentication | Required      |
| `AGENTUITY_REGION`       | Region for API endpoints   | `usc`         |
| `AGENTUITY_CATALYST_URL` | Override Catalyst API URL  | Auto-detected |
