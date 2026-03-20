# @agentuity/task

A standalone package for the Agentuity Task service - a lightweight task tracking system.

## Installation

```bash
npm install @agentuity/task
```

## Quick Start

```typescript
import { TaskClient } from '@agentuity/task';

const client = new TaskClient();

// Create a task
const task = await client.create({
  title: 'Implement new feature',
  description: 'Add support for batch operations',
  priority: 'high',
  type: 'feature'
});

console.log('Created task:', task.id);

// Add a comment
await client.createComment(task.id, 'Started working on this task');

// Create and assign tags
const tag = await client.createTag('backend', '#3366cc');
await client.addTagToTask(task.id, tag.id);

// List tasks
const { tasks, total } = await client.list({ status: 'open' });
console.log(`Found ${total} open tasks`);
```

## Configuration

```typescript
const client = new TaskClient({
  apiKey: 'your-api-key',
  url: 'https://api.agentuity.com',
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_TASK_URL` | Override Task API URL | Auto-detected |

## License

Apache-2.0