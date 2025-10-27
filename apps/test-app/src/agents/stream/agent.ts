import { type AgentContext, createAgent } from '@agentuity/server';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		input: z.object({
			operation: z.enum(['create', 'list', 'delete']),
			name: z.string().optional(),
			id: z.string().optional(),
			content: z.string().optional(),
		}),
		output: z.object({
			operation: z.string(),
			success: z.boolean(),
			result: z.any().optional(),
		}),
	},
	handler: async (c: AgentContext, { operation, name, id, content }) => {
		switch (operation) {
			case 'create': {
				if (!name || !content) {
					throw new Error('Name and content are required for create operation');
				}
				const stream = await c.stream.create(name, {
					metadata: { createdBy: 'test-agent' },
					contentType: 'text/plain',
				});

				await stream.write(content);
				await stream.close();

				return {
					operation,
					success: true,
					result: {
						id: stream.id,
						url: stream.url,
						bytesWritten: stream.bytesWritten,
					},
				};
			}

			case 'list': {
				const result = await c.stream.list({ name, limit: 10 });
				return {
					operation,
					success: result.success,
					result: {
						streams: result.streams,
						total: result.total,
					},
				};
			}

			case 'delete': {
				if (!id) {
					throw new Error('ID is required for delete operation');
				}
				await c.stream.delete(id);
				return {
					operation,
					success: true,
					result: `Deleted stream ${id}`,
				};
			}
		}
	},
});

export default agent;
