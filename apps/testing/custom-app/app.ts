import { createApp } from '@agentuity/runtime';
import { showRoutes } from 'hono/dev';
import {
	CustomKeyValueStorage,
	CustomObjectStorage,
	CustomStreamStorage,
	CustomVectorStorage,
	CustomSessionEventProvider,
	CustomEvalRunEventProvider,
} from './src/services';

const app = createApp({
	services: {
		keyvalue: new CustomKeyValueStorage(),
		object: new CustomObjectStorage(),
		stream: new CustomStreamStorage(),
		vector: new CustomVectorStorage(),
		sessionEvent: new CustomSessionEventProvider(),
		evalRunEvent: new CustomEvalRunEventProvider(),
	},
});

showRoutes(app.router);

app.logger.info('Running %s', app.server.url);
