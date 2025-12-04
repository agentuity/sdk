import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'ObjectStore Demo',
	},
	schema: {
		input: s.object({
			operation: s.enum([
				'put',
				'get',
				'delete',
				'createPublicURL',
				'putBinary',
				'getBinary',
				'listBuckets',
				'listObjects',
				'headObject',
			]),
			bucket: s.string().optional(),
			key: s.string().optional(),
			data: s.string().optional(),
			binaryData: s.array(s.number()).optional(),
			contentType: s.string().optional(),
			expiresDuration: s.number().optional(),
			prefix: s.string().optional(),
			limit: s.number().optional(),
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			result: s.any().optional(),
		}),
	},
	handler: async (c, input) => {
		const {
			operation,
			bucket,
			key,
			data,
			binaryData,
			contentType,
			expiresDuration,
			prefix,
			limit,
		} = input;
		switch (operation) {
			case 'put': {
				if (!bucket || !key) {
					throw new Error('Bucket and key are required for put operation');
				}
				if (!data) {
					throw new Error('Data is required for put operation');
				}
				await c.objectstore.put(bucket, key, new TextEncoder().encode(data));
				return {
					operation,
					success: true,
					result: `Stored ${key} in ${bucket}`,
				};
			}

			case 'get': {
				if (!bucket || !key) {
					throw new Error('Bucket and key are required for get operation');
				}
				const result = await c.objectstore.get(bucket, key);
				if (!result.exists) {
					return {
						operation,
						success: false,
						result: { exists: false },
					};
				}
				let data: string | Uint8Array = result.data;
				if (result.data instanceof Uint8Array) {
					data = new TextDecoder().decode(result.data);
				}
				return {
					operation,
					success: true,
					result: { exists: true, data, contentType: result.contentType },
				};
			}

			case 'delete': {
				if (!bucket || !key) {
					throw new Error('Bucket and key are required for delete operation');
				}
				const deleted = await c.objectstore.delete(bucket, key);
				if (deleted) {
					return {
						operation,
						success: true,
						result: `Deleted ${key} from ${bucket}`,
					};
				} else {
					return {
						operation,
						success: false,
						result: `Object ${key} not found in ${bucket} or deletion failed`,
					};
				}
			}

			case 'createPublicURL': {
				if (!bucket || !key) {
					throw new Error('Bucket and key are required for createPublicURL operation');
				}
				const url = await c.objectstore.createPublicURL(bucket, key, {
					expiresDuration,
				});
				return {
					operation,
					success: true,
					result: url,
				};
			}

			case 'putBinary': {
				if (!bucket || !key || !binaryData) {
					throw new Error('Bucket, key, and binaryData are required for putBinary operation');
				}
				const buffer = new Uint8Array(binaryData);
				await c.objectstore.put(bucket, key, buffer, {
					contentType: contentType || 'application/octet-stream',
				});
				return {
					operation,
					success: true,
					result: `Stored binary data in ${bucket}/${key}`,
				};
			}

			case 'getBinary': {
				if (!bucket || !key) {
					throw new Error('Bucket and key are required for getBinary operation');
				}
				const result = await c.objectstore.get(bucket, key);
				if (!result.exists) {
					return {
						operation,
						success: false,
						result: { exists: false, bytes: [], length: 0 },
					};
				}
				const bytes = Array.from(result.data);
				return {
					operation,
					success: true,
					result: {
						exists: true,
						bytes,
						length: bytes.length,
						contentType: result.contentType,
					},
				};
			}

			case 'listBuckets': {
				const buckets = await c.objectstore.listBuckets();
				return {
					operation,
					success: true,
					result: buckets,
				};
			}

			case 'listObjects': {
				if (!bucket) {
					throw new Error('Bucket is required for listObjects operation');
				}
				const objects = await c.objectstore.listObjects(bucket, {
					prefix,
					limit,
				});
				return {
					operation,
					success: true,
					result: objects,
				};
			}

			case 'headObject': {
				if (!bucket || !key) {
					throw new Error('Bucket and key are required for headObject operation');
				}
				try {
					const metadata = await c.objectstore.headObject(bucket, key);
					return {
						operation,
						success: true,
						result: metadata,
					};
				} catch (error) {
					return {
						operation,
						success: false,
						result: error instanceof Error ? error.message : 'Unknown error',
					};
				}
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default agent;
