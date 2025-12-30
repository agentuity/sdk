import { createApp } from '@agentuity/runtime';

const { server, logger } = await createApp({
	setup: async () => {
		// Auth schema is managed via `agentuity project auth generate` CLI command
		// which uses BetterAuth CLI to generate Drizzle migrations
	},
	shutdown: async (_state) => {
		// the state variable will be the same value was what you
		// return from setup above. you can use this callback to
		// close any resources or other shutdown related tasks
	},
});

logger.debug('Running %s', server.url);
