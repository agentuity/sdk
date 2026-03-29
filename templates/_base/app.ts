import { createApp } from '@agentuity/runtime';
import api from './src/api/index';

const app = await createApp({
	router: { path: '/api', router: api },
});

const {logger, server} = app;

logger.debug('Running %s', server.url);

export default app;
