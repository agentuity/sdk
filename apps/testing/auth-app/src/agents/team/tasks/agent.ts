import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'SubAgents Tasks Demo',
	},
	schema: {
		input: z.object({
			action: z.enum(['list', 'add', 'complete', 'remove']),
			task: z.string().optional(),
			testRunId: z.string().optional(),
		}),
		output: z.object({
			tasks: z.array(
				z.object({
					id: z.number(),
					task: z.string(),
					completed: z.boolean(),
				})
			),
			action: z.string(),
			currentAgent: z.string(),
		}),
	},
	handler: async (ctx, { action, task, testRunId }) => {
		// Store tasks in kv storage
		const storeName = 'team-data';
		const key = testRunId ? `tasks-${testRunId}` : 'tasks';
		type Task = { id: number; task: string; completed: boolean };
		let tasks: Task[] = [];

		const stored = await ctx.kv.get<Task[]>(storeName, key);
		if (stored.exists && stored.data) {
			tasks = stored.data;
		}

		let actionMsg: string = action;

		if (action === 'add' && task) {
			const newId = tasks.length > 0 ? Math.max(...tasks.map((t) => t.id)) + 1 : 1;
			tasks.push({ id: newId, task, completed: false });
			await ctx.kv.set(storeName, key, tasks);
			actionMsg = `Added task: ${task}`;
		} else if (action === 'complete' && task) {
			const taskId = Number(String(task).trim());
			if (!Number.isInteger(taskId) || Number.isNaN(taskId)) {
				actionMsg = `Error: Invalid task ID "${task}" - must be a valid integer`;
			} else {
				const taskToComplete = tasks.find((t) => t.id === taskId);
				if (taskToComplete) {
					taskToComplete.completed = true;
					await ctx.kv.set(storeName, key, tasks);
					actionMsg = `Completed task #${taskId}`;
				} else {
					actionMsg = `Error: Task #${taskId} not found`;
				}
			}
		} else if (action === 'remove') {
			await ctx.kv.delete(storeName, key);
			tasks = [];
			actionMsg = testRunId
				? `Removed all tasks for test run ${testRunId}`
				: 'Removed all tasks';
		}

		return {
			tasks,
			action: actionMsg,
			currentAgent: ctx.agentName || 'unknown',
		};
	},
});

export default agent;
