import { createApp } from '@agentuity/runtime';

// No need to specify useLocal - it's automatic when unauthenticated
const app = createApp();

app.logger.info('Running with local SQLite services at %s', app.server.url);
app.logger.debug('Database location: ~/.config/agentuity/local.db');
