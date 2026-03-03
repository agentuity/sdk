import { createAgent } from '@agentuity/runtime.ts';
import { s } from '@agentuity/schema';

const postAgent = createAgent('routing-post', {
	description: 'POST endpoint that accepts JSON body',
	schema: {
		input: s.object({
			title: s.string(),
			content: s.string(),
			tags: s.array(s.string()).optional(),
		}),
		output: s.object({
			id: s.string(),
			title: s.string(),
			content: s.string(),
			tags: s.array(s.string()),
			created: s.number(),
		}),
	},
	handler: async (_ctx, input) => {
		const id = `post-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

		return {
			id,
			title: input.title,
			content: input.content,
			tags: input.tags ?? [],
			created: Date.now(),
		};
	},
});

export default postAgent;
