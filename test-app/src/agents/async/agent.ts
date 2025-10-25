import { type AgentContext, createAgent } from '@agentuity/server';

const agent = createAgent({
	handler: (c: AgentContext) => {
		const started = performance.now();
		setTimeout(
			() =>
				c.logger.info('agent ran after %sms', Number(performance.now() - started).toFixed(2)),
			3_000
		);
	},
});

export default agent;
