import { createApp, createRouter } from '@agentuity/runtime';

export const router = createRouter();

export const app = await createApp({
	router,
	setup: async () => {
		return {
			startTime: Date.now(),
			name: 'Standalone Context Example',
		};
	},
});
