import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const streamMetadataAgent = createAgent('storage-stream-metadata', {
	description: 'Stream storage metadata operations',
	schema: {
		input: s.object({
			operation: s.string(),
			name: s.string().optional(),
			streamId: s.string().optional(),
			metadata: s.record(s.string(), s.string()).optional(),
			contentType: s.string().optional(),
			limit: s.number().optional(),
			offset: s.number().optional(),
		}),
		output: s.object({
			operation: s.string(),
			streamId: s.string().optional(),
			name: s.string().optional(),
			url: s.string().optional(),
			sizeBytes: s.number().optional(),
			metadata: s.record(s.string(), s.string()).optional(),
			streams: s
				.array(
					s.object({
						id: s.string(),
						name: s.string(),
						url: s.string(),
						sizeBytes: s.number(),
						metadata: s.record(s.string(), s.string()),
					})
				)
				.optional(),
			total: s.number().optional(),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, name, streamId, metadata, contentType, limit, offset } = input;

		switch (operation) {
			case 'create-with-metadata': {
				if (!name) throw new Error('Name required for create operation');

				const stream = await ctx.stream.create(name, {
					metadata,
					contentType,
				});

				await stream.write('test data with metadata');
				await stream.close();

				const info = await ctx.stream.get(stream.id);

				return {
					operation,
					streamId: info.id,
					name: info.name,
					url: info.url,
					sizeBytes: info.sizeBytes,
					metadata: info.metadata,
					success: true,
				};
			}

			case 'get': {
				if (!streamId) throw new Error('Stream ID required for get operation');

				const info = await ctx.stream.get(streamId);

				return {
					operation,
					streamId: info.id,
					name: info.name,
					url: info.url,
					sizeBytes: info.sizeBytes,
					metadata: info.metadata,
					success: true,
				};
			}

			case 'list': {
				const result = await ctx.stream.list({
					name,
					metadata,
					limit,
					offset,
				});

				return {
					operation,
					streams: result.streams,
					total: result.total,
					success: true,
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default streamMetadataAgent;
