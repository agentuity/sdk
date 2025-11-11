import { createApp } from '@agentuity/runtime';
import { showRoutes } from 'hono/dev';
import {
	CustomKeyValueStorage,
	CustomObjectStorage,
	CustomStreamStorage,
	CustomVectorStorage,
	CustomSessionEventProvider,
} from './src/services';

const app = createApp({
	services: {
		keyvalue: new CustomKeyValueStorage(),
		object: new CustomObjectStorage(),
		stream: new CustomStreamStorage(),
		vector: new CustomVectorStorage(),
		sessionEvent: new CustomSessionEventProvider(),
	},
});

showRoutes(app.router);

app.logger.info('Running %s', app.server.url);
