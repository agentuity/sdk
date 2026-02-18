import { z } from 'zod';
import type { ToolContext } from '@opencode-ai/plugin';
import type { AgentRole } from '../types';
import { AgentRoleSchema } from '../types';
import { agents } from '../agents';
import type { BackgroundManager } from '../background';

export const BackgroundTaskArgsSchema = z.object({
	agent: AgentRoleSchema.describe('Agent role to run the task'),
	task: z.string().describe('Task prompt to run in the background'),
	description: z.string().optional().describe('Short description of the task'),
});

export const BackgroundOutputArgsSchema = z.object({
	task_id: z.string().describe('Background task ID'),
});

export const BackgroundCancelArgsSchema = z.object({
	task_id: z.string().describe('Background task ID'),
});

export type BackgroundTaskArgs = z.infer<typeof BackgroundTaskArgsSchema>;
export type BackgroundOutputArgs = z.infer<typeof BackgroundOutputArgsSchema>;
export type BackgroundCancelArgs = z.infer<typeof BackgroundCancelArgsSchema>;

export function createBackgroundTools(manager: BackgroundManager): {
	backgroundTaskTool: {
		name: string;
		description: string;
		args: typeof BackgroundTaskArgsSchema;
		execute: (
			args: BackgroundTaskArgs,
			context: ToolContext
		) => Promise<{
			taskId: string;
			sessionId?: string;
			status: string;
			message: string;
		}>;
	};
	backgroundOutputTool: {
		name: string;
		description: string;
		args: typeof BackgroundOutputArgsSchema;
		execute: (args: BackgroundOutputArgs) => Promise<{
			taskId: string;
			sessionId?: string;
			status: string;
			result?: string;
			error?: string;
		}>;
	};
	backgroundCancelTool: {
		name: string;
		description: string;
		args: typeof BackgroundCancelArgsSchema;
		execute: (args: BackgroundCancelArgs) => Promise<{
			taskId: string;
			success: boolean;
			message: string;
		}>;
	};
} {
	const backgroundTaskTool = {
		name: 'agentuity_background_task',
		description: 'Launch a task to run in the background.',
		args: BackgroundTaskArgsSchema,
		async execute(
			args: BackgroundTaskArgs,
			context: ToolContext
		): Promise<{
			taskId: string;
			sessionId?: string;
			status: string;
			message: string;
		}> {
			const agentName = resolveAgentName(args.agent);
			const task = await manager.launch({
				description: args.description ?? args.task,
				prompt: args.task,
				agent: agentName,
				parentSessionId: context.sessionID,
				parentMessageId: context.messageID,
			});

			return {
				taskId: task.id,
				sessionId: task.sessionId,
				status: task.status,
				message:
					task.status === 'error'
						? (task.error ?? 'Failed to launch background task.')
						: 'Background task launched.',
			};
		},
	};

	const backgroundOutputTool = {
		name: 'agentuity_background_output',
		description: 'Retrieve output for a background task.',
		args: BackgroundOutputArgsSchema,
		async execute(args: BackgroundOutputArgs): Promise<{
			taskId: string;
			sessionId?: string;
			status: string;
			result?: string;
			error?: string;
		}> {
			const task = manager.getTask(args.task_id);
			if (!task) {
				return {
					taskId: args.task_id,
					status: 'error',
					error: 'Task not found.',
				};
			}
			return {
				taskId: task.id,
				sessionId: task.sessionId,
				status: task.status,
				result: task.result,
				error: task.error,
			};
		},
	};

	const backgroundCancelTool = {
		name: 'agentuity_background_cancel',
		description: 'Cancel a running background task.',
		args: BackgroundCancelArgsSchema,
		async execute(args: BackgroundCancelArgs): Promise<{
			taskId: string;
			success: boolean;
			message: string;
		}> {
			const success = manager.cancel(args.task_id);
			return {
				taskId: args.task_id,
				success,
				message: success ? 'Background task cancelled.' : 'Unable to cancel task.',
			};
		},
	};

	return { backgroundTaskTool, backgroundOutputTool, backgroundCancelTool };
}

function resolveAgentName(role: AgentRole): string {
	const agent = agents[role];
	return agent?.displayName ?? role;
}
