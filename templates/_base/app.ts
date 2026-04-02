import { createApp } from '@agentuity/runtime';
import api from './src/api/index';
import agents from './src/agent';

const app = await createApp({
	router: { path: '/api', router: api },
	agents,
  workbench: {
    route: "/workbench",
  },
});

const {logger, server} = app;

logger.debug('Running %s', server.url);

export default app;
