import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', (c) => {
	return c.text('Hi from foo');
});

router.get('/log_test', (c) => {
	c.var.logger.info('Hi from foo');
	c.var.logger.error('Error from foo');
	c.var.logger.warn('Warn from foo');
	c.var.logger.debug('Debug from foo');
	c.var.logger.trace('Trace from foo');
	return c.text('log_test');
});

export default router;
