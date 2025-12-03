import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'SubAgent Members Demo',
	},
	schema: {
		input: z.object({
			action: z.enum(['list', 'add', 'remove']),
			name: z.string().optional(),
			testRunId: z.string().optional(),
		}),
		output: z.object({
			members: z.array(z.string()),
			action: z.string(),
			parentInfo: z.string().optional(),
		}),
	},
	handler: async (ctx, { action, name, testRunId }) => {
		// Store members in kv storage
		const storeName = 'team-data';
		const key = testRunId ? `members-${testRunId}` : 'members';
		let members: string[] = [];

		const stored = await ctx.kv.get<string[]>(storeName, key);
		if (stored.exists && stored.data) {
			members = stored.data;
		}

		let actionMsg: string = action;

		if (action === 'add' && name) {
			if (!members.includes(name)) {
				members.push(name);
				await ctx.kv.set(storeName, key, members);
			}
			actionMsg = `Added ${name}`;
		} else if (action === 'remove' && name) {
			members = members.filter((m) => m !== name);
			await ctx.kv.set(storeName, key, members);
			actionMsg = `Removed ${name}`;
		}

		const parentResult = await ctx.agent.team.run({ action: 'info' });
		const parentInfo = `Parent says: ${parentResult.message}`;

		return {
			members,
			action: actionMsg,
			parentInfo,
		};
	},
});

export default agent;
