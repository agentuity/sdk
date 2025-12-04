import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'SubAgent Members Demo',
	},
	schema: {
		input: s.object({
			action: s.enum(['list', 'add', 'remove']),
			name: s.string().optional(),
			testRunId: s.string().optional(),
		}),
		output: s.object({
			members: s.array(s.string()),
			action: s.string(),
			parentInfo: s.string().optional(),
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
