import { createApp } from '@agentuity/runtime';
import { showRoutes } from 'hono/dev';
import {
	CustomKeyValueStorage,
	CustomObjectStorage,
	CustomStreamStorage,
	CustomVectorStorage,
} from './src/services';

const { app, server, logger } = createApp({
	services: {
		keyvalue: new CustomKeyValueStorage(),
		object: new CustomObjectStorage(),
		stream: new CustomStreamStorage(),
		vector: new CustomVectorStorage(),
	},
});

showRoutes(app);

logger.info('Running %s', server.url);
