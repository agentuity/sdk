# Streaming Response Example

Demonstrates how to return streaming responses from agents using ReadableStream.

## Features

- Streaming responses with `ReadableStream`
- Chunked data delivery
- Real-time updates
- Memory-efficient processing

## Running

```bash
cd examples/streaming
bun install
bun run build
bun run dev
```

## Usage

```bash
curl http://localhost:3500/agent/readable-stream
```

## Key Concepts

### Creating a Streaming Agent

```typescript
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent('streaming-example', {
	schema: {
		input: z.object({ count: z.number() }),
		output: z.string(),
		stream: true, // Enable streaming
	},
	handler: async (ctx, { count }) => {
		return new ReadableStream({
			async start(controller) {
				for (let i = 0; i < count; i++) {
					const chunk = `Chunk ${i + 1}\n`;
					controller.enqueue(chunk);
					await new Promise((r) => setTimeout(r, 100));
				}
				controller.close();
			},
		});
	},
});
```

### Stream Types

**Text Streams:**

```typescript
return new ReadableStream({
	start(controller) {
		controller.enqueue('Hello ');
		controller.enqueue('World');
		controller.close();
	},
});
```

**Binary Streams:**

```typescript
return new ReadableStream({
	start(controller) {
		const encoder = new TextEncoder();
		controller.enqueue(encoder.encode('data'));
		controller.close();
	},
});
```

## Use Cases

- **Large responses** - Stream data instead of buffering
- **Real-time updates** - Send updates as they happen
- **Progress reporting** - Show progress during long operations
- **File streaming** - Stream files without loading into memory
- **AI responses** - Stream LLM output as it's generated

## Best Practices

1. **Always close streams** - Call `controller.close()` when done
2. **Handle errors** - Use try/catch and `controller.error()`
3. **Memory management** - Don't buffer entire stream
4. **Backpressure** - Respect stream backpressure signals
5. **Set content type** - Use appropriate Content-Type headers
