import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const sessionBasicAgent = createAgent('session-basic', {
	description: 'Basic session ID and state access',
	schema: {
		input: s.object({
			operation: s.string(),
			key: s.string().optional(),
			value: s.any().optional(),
		}),
		output: s.object({
			operation: s.string(),
			sessionId: s.string().optional(),
			threadId: s.string().optional(),
			value: s.any().optional(),
			stateSize: s.number().optional(),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, key, value } = input;

		switch (operation) {
			case 'get-ids': {
				return {
					operation,
					sessionId: ctx.session.id,
					threadId: ctx.thread.id,
					success: true,
				};
			}

			case 'session-state-set': {
				if (!key) throw new Error('Key required');
				ctx.session.state.set(key, value);
				return {
					operation,
					success: true,
					stateSize: ctx.session.state.size,
				};
			}

			case 'session-state-get': {
				if (!key) throw new Error('Key required');
				const retrieved = ctx.session.state.get(key);
				return {
					operation,
					value: retrieved,
					success: true,
				};
			}

			case 'thread-state-set': {
				if (!key) throw new Error('Key required');
				ctx.thread.state.set(key, value);
				return {
					operation,
					success: true,
					stateSize: ctx.thread.state.size,
				};
			}

			case 'thread-state-get': {
				if (!key) throw new Error('Key required');
				const retrieved = ctx.thread.state.get(key);
				return {
					operation,
					value: retrieved,
					success: true,
				};
			}

			case 'thread-empty': {
				const isEmpty = ctx.thread.empty();
				return {
					operation,
					value: isEmpty,
					success: true,
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default sessionBasicAgent;
