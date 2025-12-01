import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
        name: 'test__multiple___underscores',
        description: 'Test agent with multiple underscores',
    },
	schema: {
		input: z.string(),
		output: z.string(),
	},
	handler: async (_c, input) => {
		return input;
	},
});

export default agent;
