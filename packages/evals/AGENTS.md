# Evals Package - Agent Guidelines

## Overview

The `@agentuity/evals` package provides a framework for creating reusable, configurable evaluation functions ("preset evals") that can be attached to agents to assess their behavior.

## Core Concepts

### Preset Evals

A "preset eval" is a pre-configured evaluation that can be reused across multiple agents with optional overrides. They're created with `createPresetEval()` and return a factory function.

```typescript
import { createPresetEval } from '@agentuity/evals';

// Create a preset eval
export const myEval = createPresetEval<TInput, TOutput, TOptions>({
	name: 'eval-name',
	description: 'What this eval checks',
	options: {
		/* default options */
	},
	handler: async (ctx, input, output, options) => {
		// Evaluation logic
		return { success: true, passed: true, metadata: { reason: '...' } };
	},
});

// Use it on an agent
agent.createEval(myEval({ name: 'custom-name', ...optionOverrides }));
```

## Generics

`createPresetEval` accepts three generic parameters:

```typescript
createPresetEval<TInput, TOutput, TOptions>();
```

### TInput / TOutput (Schema Types)

These control the types of `input` and `output` in the handler. They must be `StandardSchemaV1` instances (from `@agentuity/schema`) or `undefined`.

```typescript
import { s } from '@agentuity/schema';

// Define schemas for typed handler access
const inputSchema = s.object({ value: s.string() });
const outputSchema = s.object({ result: s.number() });

export const typedEval = createPresetEval<typeof inputSchema, typeof outputSchema, MyOptions>({
	handler: async (ctx, input, output, options) => {
		// input is typed as { value: string }
		// output is typed as { result: number }
	},
});
```

**Use `undefined` for generic evals** that work with any agent:

```typescript
export const genericEval = createPresetEval<undefined, undefined, MyOptions>({
	handler: async (ctx, input, output, options) => {
		// input and output are typed as unknown
	},
});
```

**Common mistake** - plain objects are NOT schemas:

```typescript
// ❌ WRONG - plain object
const schema = { value: s.string() };

// ✅ CORRECT - use s.object()
const schema = s.object({ value: s.string() });
```

### TOptions (Options Type)

Must extend `BaseEvalOptions`. Defines the configuration options for the eval.

```typescript
import type { BaseEvalOptions } from '@agentuity/evals';

type MyEvalOptions = BaseEvalOptions & {
	threshold: number;
	mode: 'strict' | 'lenient';
};

export const myEval = createPresetEval<undefined, undefined, MyEvalOptions>({
	options: {
		model: 'gpt-4o', // from BaseEvalOptions
		threshold: 0.8,
		mode: 'strict',
	},
	// ...
});
```

## Flattened Override API

When calling a preset eval, options are flattened into the base object (not nested under `options`):

```typescript
// ✅ CORRECT - flattened
agent.createEval(myEval({ name: 'custom', model: 'gpt-4o-mini', threshold: 0.9 }));

// ❌ WRONG - nested (old API)
agent.createEval(myEval({ name: 'custom', options: { model: 'gpt-4o-mini' } }));
```

## Middleware

Middleware allows reusing preset evals across agents with different schemas by transforming agent input/output to the eval's expected types.

```typescript
// Define agent schemas
const AgentInput = s.object({ value: s.number() });
const AgentOutput = s.object({ result: s.number(), doubled: s.boolean() });

const myAgent = createAgent({
	schema: { input: AgentInput, output: AgentOutput },
	// ...
});

// Pass agent schema types as generics for typed middleware transforms
myAgent.createEval(
	politenessEval<typeof AgentInput, typeof AgentOutput>({
		middleware: {
			transformInput: (input) => ({ value: String(input.value) }), // input is typed!
			transformOutput: (output) => ({ result: String(output.result) }), // output is typed!
		},
	})
);

// Without generics, middleware params are `any`
myAgent.createEval(
	politenessEval({
		middleware: {
			transformInput: (input) => ({ value: String(input.value) }),
			transformOutput: (output) => ({ result: String(output.result) }),
		},
	})
);
```

The middleware is optional. When not provided, the agent's input/output are passed directly to the eval handler.

## Handler Return Types

Eval handlers must return an `EvalResult`:

```typescript
// Binary pass/fail
return {
	success: true,
	passed: true, // or false
	metadata: { reason: 'Why it passed/failed' },
};

// Scored result (0.0-1.0)
return {
	success: true,
	score: 0.85,
	metadata: { reason: 'Accuracy score explanation' },
};
```

## Complete Example

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { s } from '@agentuity/schema';
import { createPresetEval, type BaseEvalOptions } from '@agentuity/evals';

// Schema for typed access (optional)
const inputSchema = s.object({ message: s.string() });
const outputSchema = s.object({ response: s.string() });

// Custom options
type ToneEvalOptions = BaseEvalOptions & {
	expectedTone: 'formal' | 'casual' | 'friendly';
};

export const toneEval = createPresetEval<typeof inputSchema, typeof outputSchema, ToneEvalOptions>({
	name: 'tone-check',
	description: 'Evaluates if the response matches the expected tone',
	options: {
		model: 'gpt-4o',
		expectedTone: 'friendly',
	},
	handler: async (ctx, input, output, options) => {
		const result = await generateText({
			model: openai(options.model),
			prompt: `Is this response "${output.response}" written in a ${options.expectedTone} tone? Answer yes or no.`,
		});

		const passed = result.text.toLowerCase().includes('yes');

		return {
			success: true,
			passed,
			metadata: {
				reason: passed
					? `Response matches ${options.expectedTone} tone`
					: `Response does not match ${options.expectedTone} tone`,
				llmResponse: result.text,
			},
		};
	},
});

// Usage
agent.createEval(toneEval()); // Use defaults
agent.createEval(toneEval({ expectedTone: 'formal' })); // Override tone
agent.createEval(toneEval({ name: 'formal-tone', expectedTone: 'formal', model: 'gpt-4o-mini' }));
```

## File Structure

```
packages/evals/
├── src/
│   ├── index.ts      # Exports + example preset evals
│   ├── _utils.ts     # createPresetEval implementation
│   └── types.ts      # BaseEvalOptions, EvalMiddleware types
├── test/
│   └── *.test.ts
├── package.json
└── AGENTS.md         # This file
```

## Key Points

1. **Schema types required** - Use `s.object({...})` for typed input/output, or `undefined` for generic evals
2. **Flattened options** - Override options directly in the call, not nested under `options`
3. **Extend BaseEvalOptions** - Custom options must extend `BaseEvalOptions` for the `model` field
4. **Return format** - Always return `{ success, passed/score, metadata: { reason } }`
5. **Reusable** - Preset evals are designed to be shared across agents with different configurations
6. **Middleware** - Use `middleware` to transform agent input/output to eval's expected types when schemas differ
