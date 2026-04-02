import { createApp } from '@agentuity/runtime';

const app = await createApp();

app.logger.debug('Running %s', app.server.url);

export default app;
