import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const streamCrudAgent = createAgent('storage-stream-crud', {
	description: 'Stream storage CRUD operations',
	schema: {
		input: s.object({
			operation: s.string(),
			name: s.string().optional(),
			streamId: s.string().optional(),
			data: s.string().optional(),
		}),
		output: s.object({
			operation: s.string(),
			streamId: s.string().optional(),
			url: s.string().optional(),
			data: s.string().optional(),
			sizeBytes: s.number().optional(),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, name, streamId, data } = input;

		switch (operation) {
			case 'create-write-close': {
				if (!name) throw new Error('Name required for create operation');
				if (!data) throw new Error('Data required for write operation');

				const stream = await ctx.stream.create(name);
				await stream.write(data);
				await stream.close();

				return {
					operation,
					streamId: stream.id,
					url: stream.url,
					success: true,
				};
			}

			case 'create-write-read': {
				if (!name) throw new Error('Name required for create operation');
				if (!data) throw new Error('Data required for write operation');

				const stream = await ctx.stream.create(name);
				await stream.write(data);
				await stream.close();

				const reader = stream.getReader();
				const chunks: Uint8Array[] = [];
				const textDecoder = new TextDecoder();

				for await (const chunk of reader as any) {
					chunks.push(chunk);
				}

				const combinedChunks = new Uint8Array(
					chunks.reduce((acc, chunk) => acc + chunk.length, 0)
				);
				let offset = 0;
				for (const chunk of chunks) {
					combinedChunks.set(chunk, offset);
					offset += chunk.length;
				}

				const readData = textDecoder.decode(combinedChunks);

				return {
					operation,
					streamId: stream.id,
					url: stream.url,
					data: readData,
					success: true,
				};
			}

			case 'download': {
				if (!streamId) throw new Error('Stream ID required for download');

				const readable = await ctx.stream.download(streamId);
				const chunks: Uint8Array[] = [];
				const textDecoder = new TextDecoder();

				for await (const chunk of readable as any) {
					chunks.push(chunk);
				}

				const combinedChunks = new Uint8Array(
					chunks.reduce((acc, chunk) => acc + chunk.length, 0)
				);
				let offset = 0;
				for (const chunk of chunks) {
					combinedChunks.set(chunk, offset);
					offset += chunk.length;
				}

				const downloadedData = textDecoder.decode(combinedChunks);

				return {
					operation,
					streamId,
					data: downloadedData,
					success: true,
				};
			}

			case 'delete': {
				if (!streamId) throw new Error('Stream ID required for delete');
				await ctx.stream.delete(streamId);
				return { operation, streamId, success: true };
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default streamCrudAgent;
