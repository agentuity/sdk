import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const streamTypesAgent = createAgent('storage-stream-types', {
	description: 'Stream storage with different data types',
	schema: {
		input: s.object({
			operation: s.string(),
			name: s.string(),
			data: s.union(s.string(), s.record(s.string(), s.any())).optional(),
		}),
		output: s.object({
			operation: s.string(),
			streamId: s.string(),
			url: s.string(),
			data: s.union(s.string(), s.record(s.string(), s.any())).optional(),
			contentType: s.string().optional(),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, name, data } = input;

		switch (operation) {
			case 'write-string': {
				if (typeof data !== 'string') throw new Error('String data required');

				const stream = await ctx.stream.create(name, {
					contentType: 'text/plain',
				});

				await stream.write(data);
				await stream.close();

				const reader = stream.getReader();
				const chunks: Uint8Array[] = [];
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

				const readData = new TextDecoder().decode(combinedChunks);

				return {
					operation,
					streamId: stream.id,
					url: stream.url,
					data: readData,
					contentType: 'text/plain',
					success: true,
				};
			}

			case 'write-binary': {
				if (typeof data !== 'string') throw new Error('String data required for binary test');

				const stream = await ctx.stream.create(name, {
					contentType: 'application/octet-stream',
				});

				const encoder = new TextEncoder();
				const binaryData = encoder.encode(data);
				await stream.write(binaryData);
				await stream.close();

				const reader = stream.getReader();
				const chunks: Uint8Array[] = [];
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

				const readData = new TextDecoder().decode(combinedChunks);

				return {
					operation,
					streamId: stream.id,
					url: stream.url,
					data: readData,
					contentType: 'application/octet-stream',
					success: true,
				};
			}

			case 'write-json': {
				if (typeof data !== 'object') throw new Error('Object data required for JSON test');

				const stream = await ctx.stream.create(name, {
					contentType: 'application/json',
				});

				await stream.write(data);
				await stream.close();

				const reader = stream.getReader();
				const chunks: Uint8Array[] = [];
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

				const readData = new TextDecoder().decode(combinedChunks);
				const parsedData = JSON.parse(readData);

				return {
					operation,
					streamId: stream.id,
					url: stream.url,
					data: parsedData,
					contentType: 'application/json',
					success: true,
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default streamTypesAgent;
