import { createRouter } from '@agentuity/server';

const router = createRouter();

router.get('/', async (c) => {
	c.logger.info('running agent endpoint with metadata: %o', c.agent.async.metadata);
	const res = await c.kv.get('foo', 'bar');
	c.logger.info('kv returned: %o', res);
	if (!res.exists) {
		c.logger.info('kv not found, will add to keyvalue store');
		await c.kv.set('foo', 'bar', 'hi');
	} else {
		c.logger.info('kv found, will delete from the keyvalue store');
		await c.kv.delete('foo', 'bar');
	}
	// await c.stream.delete('stream_019a1ea1b06470fd957969a37e896273');
	// const sres = await c.stream.create('test', { contentType: 'text/plain' });
	// await sres.write('hi');
	// await sres.close();
	// const sres = await c.stream.list();
	// console.log(sres.id, sres.url);
	c.waitUntil(() => c.agent.async.run());
	return c.text('Async task started');
});

export default router;
