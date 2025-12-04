import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Streams Demo',
	},
	schema: {
		input: s.object({
			operation: s.enum(['create', 'list', 'delete', 'read']),
			name: s.string().optional(),
			id: s.string().optional(),
			content: s.string().optional(),
			contentType: s.string().optional(),
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			result: s.any().optional(),
		}),
	},
	handler: async (c, input) => {
		const { operation, name, id, content, contentType } = input;
		switch (operation) {
			case 'create': {
				if (!name || !content) {
					throw new Error('Name and content are required for create operation');
				}
				const stream = await c.stream.create(name, {
					metadata: { createdBy: 'test-agent' },
					contentType: contentType || 'text/plain',
				});

				// For binary content types, decode base64
				if (
					contentType &&
					(contentType.startsWith('image/') || contentType === 'application/octet-stream')
				) {
					const buffer = Buffer.from(content, 'base64');
					await stream.write(buffer);
				} else {
					await stream.write(content);
				}
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

			case 'read': {
				if (!id) {
					throw new Error('ID is required for read operation');
				}
				const url = process.env.AGENTUITY_STREAM_URL || 'https://streams.agentuity.cloud';
				const response = await fetch(`${url}/${id}`, {
					headers: {
						Authorization: `Bearer ${process.env.AGENTUITY_SDK_KEY}`,
					},
				});

				if (!response.ok) {
					throw new Error(`Failed to read stream: ${response.statusText}`);
				}

				const data = await response.arrayBuffer();
				const contentTypeHeader =
					response.headers.get('content-type') || 'application/octet-stream';

				return {
					operation,
					success: true,
					result: {
						id,
						contentType: contentTypeHeader,
						size: data.byteLength,
						data: Buffer.from(data).toString('base64'),
					},
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default agent;
