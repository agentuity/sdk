# Agent Evals Example

Demonstrates how to create and run evaluations (evals) to test agent quality and correctness.

## Features

- Creating evals with `createEval()`
- Running evals automatically on agent completion
- Input/output validation
- Multiple evals per agent

## Running

```bash
cd examples/evals
bun install
bun run build
bun run dev
```

## Usage

```bash
curl http://localhost:3500/agent/eval \
  --json '{"input":"test"}'
```

Check server logs to see eval results.

## Key Concepts

### Creating Evals

```typescript
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent('eval-example', {
	schema: {
		input: z.object({ x: z.number() }),
		output: z.number(),
	},
	handler: async (ctx, input) => {
		return input.x * 2;
	},
});

// Create eval function
agent.createEval('doubles input correctly', {
	description: 'Verifies output is exactly double the input',
	handler: async (ctx, input, output) => {
		return output === input.x * 2;
	},
});

export default agent;
```

### Multiple Evals

You can create multiple evals for different test cases:

```typescript
agent.createEval('output is positive', {
	description: 'Ensures output is greater than zero',
	handler: async (ctx, input, output) => output > 0,
});

agent.createEval('output is even', {
	description: 'Checks if output is an even number',
	handler: async (ctx, input, output) => output % 2 === 0,
});
```

### Eval Execution

Evals run automatically after the agent completes:

1. Agent handler executes
2. Output is captured
3. All evals run with (input, output)
4. Results logged/stored

## Use Cases

- **Quality Testing** - Validate agent behavior
- **Regression Testing** - Ensure outputs remain correct
- **A/B Testing** - Compare different implementations
- **Monitoring** - Track production quality
