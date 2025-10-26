import { createRouter } from '@agentuity/server';

const router = createRouter();

router.get('/', async (c) => {
	const res = await c.kv.get('foo', 'bar');
	c.logger.info('res: %o', res);
	if (!res.exists) {
		c.logger.info('not found, will add to keyvalue store');
		await c.kv.set('foo', 'bar', 'hi');
	} else {
		c.logger.info('found, will delete from the keyvalue store');
		await c.kv.delete('foo', 'bar');
	}
	c.waitUntil(() => c.agent.async.run());
	return c.text('Async task started');
});

export default router;
