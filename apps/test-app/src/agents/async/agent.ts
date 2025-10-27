import { type AgentContext, createAgent } from '@agentuity/server';

export default createAgent({
	metadata: {
		name: 'Async Agent',
		description: 'This is an example of an agent that takes time to run',
	},
	handler: (c: AgentContext) => {
		const started = performance.now();
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				c.logger.info(
					'agent ran after %sms (%s)',
					Number(performance.now() - started).toFixed(2),
					c.sessionId
				);
				resolve();
			}, 3_000);
		});
	},
});
