# @agentuity/db

A standalone package for the Agentuity Database service.

## Installation

```bash
npm install @agentuity/db
```

## Quick Start

```typescript
import { DBClient } from '@agentuity/db';

const client = new DBClient();

// Query the database
const result = await client.query('SELECT * FROM users LIMIT 10');
for (const row of result.rows) {
  console.log(row);
}

// Get table schemas
const tables = await client.tables();
for (const table of tables) {
  console.log(`${table.name}: ${table.columns.length} columns`);
}

// View query logs
const logs = await client.logs({ limit: 100 });
for (const log of logs.logs) {
  console.log(`${log.query}: ${log.duration}ms`);
}
```

## Configuration

```typescript
const client = new DBClient({
  apiKey: 'your-api-key',
  url: 'https://api.agentuity.com',
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_DB_URL` | Override DB API URL | Auto-detected |

## License

Apache-2.0