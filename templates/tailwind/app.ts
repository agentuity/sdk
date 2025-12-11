import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

const workbench = createWorkbench();

const { server, logger } = await createApp({
	setup: async () => {
		// anything you return from this will be automatically
		// available in the ctx.app. this allows you to initialize
		// global resources and make them available to routes and
		// agents in a typesafe way
	},
	shutdown: async (_state) => {
		// the state variable will be the same value was what you
		// return from setup above. you can use this callback to
		// close any resources or other shutdown related tasks
	},
	services: {
		// enable workbench
		workbench,
	},
});

logger.debug('Running %s', server.url);
