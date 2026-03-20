# @agentuity/schedule

A standalone package for the Agentuity Schedule service.

## Installation

```bash
npm install @agentuity/schedule
```

## Quick Start

```typescript
import { ScheduleClient } from '@agentuity/schedule';

const client = new ScheduleClient();

// Create a schedule that runs every hour
const result = await client.create({
  name: 'Hourly Sync',
  expression: '0 * * * *',
  destinations: [
    { type: 'url', config: { url: 'https://example.com/sync' } }
  ]
});

console.log('Created schedule:', result.schedule.id);
console.log('Next run:', result.schedule.due_date);

// List all schedules
const { schedules, total } = await client.list();
console.log(`Found ${total} schedules`);

// Get schedule details
const { schedule, destinations } = await client.get(result.schedule.id);
```

## Configuration

```typescript
const client = new ScheduleClient({
  apiKey: 'your-api-key',
  url: 'https://api.agentuity.com',
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_SCHEDULE_URL` | Override Schedule API URL | Auto-detected |

## License

Apache-2.0