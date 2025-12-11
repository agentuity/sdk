import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('greeting', {
	description: 'Greets a user by name',
	schema: {
		input: s.object({
			name: s.string(),
		}),
		output: s.object({
			message: s.string(),
			timestamp: s.number(),
		}),
	},
	handler: async (ctx, input) => {
		ctx.logger.info('Greeting user: %s', input.name);
		
		// Access app state
		ctx.logger.debug('App name: %s', ctx.app.name);
		
		// Use KV storage
		const count = (await ctx.kv.get<number>('greeting-count')) ?? 0;
		await ctx.kv.set('greeting-count', count + 1);
		ctx.logger.debug('Greeting count: %d', count + 1);
		
		// Schedule background task
		ctx.waitUntil(async () => {
			ctx.logger.info('Background task: Logged greeting for %s', input.name);
		});
		
		return {
			message: `Hello, ${input.name}! You are visitor #${count + 1}.`,
			timestamp: Date.now(),
		};
	},
});
