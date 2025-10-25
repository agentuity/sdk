import { type AgentContext, createAgent } from '@agentuity/server';
import { z } from 'zod';

const agent = createAgent({
    schema: {
        input: z.object({ name: z.string(), age: z.number() }),
        output: z.string(),
    },
    handler: async (_c: AgentContext, { name, age }) => {
        return `Hello, ${name}! You are ${age} years old.`;
    },
});

export default agent;
