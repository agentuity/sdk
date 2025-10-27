import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		input: z.object({
			operation: z.enum(['put', 'get', 'delete', 'createPublicURL', 'putBinary', 'getBinary']),
			bucket: z.string(),
			key: z.string(),
			data: z.string().optional(),
			binaryData: z.array(z.number()).optional(),
			contentType: z.string().optional(),
			expiresDuration: z.number().optional(),
		}),
		output: z.object({
			operation: z.string(),
			success: z.boolean(),
			result: z.any().optional(),
		}),
	},
	handler: async (
		c: AgentContext,
		{ operation, bucket, key, data, binaryData, contentType, expiresDuration }
	) => {
		switch (operation) {
			case 'put': {
				if (!data) {
					throw new Error('Data is required for put operation');
				}
				const encoder = new TextEncoder();
				const bytes = encoder.encode(data);
				await c.objectstore.put(bucket, key, bytes, {
					contentType: contentType || 'text/plain',
				});
				return {
					operation,
					success: true,
					result: `Stored ${key} in ${bucket}`,
				};
			}

			case 'get': {
				const result = await c.objectstore.get(bucket, key);
				if (result.exists) {
					const decoder = new TextDecoder();
					const text = decoder.decode(result.data);
					return {
						operation,
						success: true,
						result: {
							data: text,
							contentType: result.contentType,
						},
					};
				}
				return {
					operation,
					success: false,
					result: 'Object not found',
				};
			}

			case 'delete': {
				const deleted = await c.objectstore.delete(bucket, key);
				return {
					operation,
					success: deleted,
					result: deleted ? `Deleted ${key}` : 'Object not found',
				};
			}

			case 'createPublicURL': {
				const url = await c.objectstore.createPublicURL(bucket, key, {
					expiresDuration: expiresDuration || 3600000, // default 1 hour
				});
				return {
					operation,
					success: true,
					result: url,
				};
			}

			case 'putBinary': {
				if (!binaryData) {
					throw new Error('Binary data is required for putBinary operation');
				}
				// Store binary data - including null bytes and high bytes
				const bytes = new Uint8Array(binaryData);
				await c.objectstore.put(bucket, key, bytes, {
					contentType: contentType || 'application/octet-stream',
				});
				return {
					operation,
					success: true,
					result: `Stored ${bytes.length} bytes in ${bucket}/${key}`,
				};
			}

			case 'getBinary': {
				const result = await c.objectstore.get(bucket, key);
				if (result.exists) {
					// Return binary data as array of numbers to verify no transformation
					return {
						operation,
						success: true,
						result: {
							bytes: Array.from(result.data),
							contentType: result.contentType,
							length: result.data.length,
						},
					};
				}
				return {
					operation,
					success: false,
					result: 'Object not found',
				};
			}
		}
	},
});

export default agent;
