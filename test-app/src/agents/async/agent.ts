import { type AgentContext, createAgent } from '@agentuity/server';

const agent = createAgent({
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

export default agent;
