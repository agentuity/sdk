import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	return c.json({
		message: 'Object Store Test Agent',
		operations: ['put', 'get', 'delete', 'createPublicURL', 'putBinary', 'getBinary'],
		usage: {
			put: 'POST with { operation: "put", bucket: "my-bucket", key: "my-key", data: "hello world", contentType: "text/plain" }',
			get: 'POST with { operation: "get", bucket: "my-bucket", key: "my-key" }',
			delete: 'POST with { operation: "delete", bucket: "my-bucket", key: "my-key" }',
			createPublicURL:
				'POST with { operation: "createPublicURL", bucket: "my-bucket", key: "my-key", expiresDuration: 3600000 }',
			putBinary:
				'POST with { operation: "putBinary", bucket: "my-bucket", key: "binary-file", binaryData: [0, 1, 2, 255, 254, 253, 128, 127] }',
			getBinary: 'POST with { operation: "getBinary", bucket: "my-bucket", key: "binary-file" }',
		},
	});
});

router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.objectstore.run(data);
	return c.json(result);
});

export default router;
