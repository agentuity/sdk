import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const multipleListenersAgent = createAgent('events-multiple', {
	description: 'Tests multiple event listeners on same event',
	schema: {
		input: s.object({
			operation: s.string(),
		}),
		output: s.object({
			operation: s.string(),
			listenersCalled: s.number(),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		let callCount = 0;

		// Add multiple listeners for the same event
		const listener1 = () => {
			callCount++;
		};
		const listener2 = () => {
			callCount++;
		};
		const listener3 = () => {
			callCount++;
		};

		multipleListenersAgent.addEventListener('started', listener1);
		multipleListenersAgent.addEventListener('started', listener2);
		multipleListenersAgent.addEventListener('started', listener3);

		return {
			operation: input.operation,
			listenersCalled: callCount,
			success: true,
		};
	},
});

export default multipleListenersAgent;
