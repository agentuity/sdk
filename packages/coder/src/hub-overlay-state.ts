export interface StreamBuffer {
	output: string;
	thinking: string;
}

export interface StreamProjectionBlock {
	output?: string;
	thinking?: string;
}

export interface StreamProjection {
	output?: string;
	thinking?: string;
	tasks?: Record<string, StreamProjectionBlock>;
}

export interface ConversationEntryLike {
	type?: string;
	content?: string;
	thinking?: string;
	taskId?: string | null;
	toolName?: string;
	toolArgs?: Record<string, unknown>;
}

export type StreamProjectionSource = 'none' | 'snapshot' | 'replay' | 'hydration' | 'live';

export interface NormalizedStreamProjection {
	output: string;
	thinking: string;
	tasks: Record<string, StreamBuffer>;
}

export function normalizeStreamProjection(
	projection: StreamProjection | null | undefined
): NormalizedStreamProjection {
	const tasks: Record<string, StreamBuffer> = {};
	const rawTasks =
		projection?.tasks && typeof projection.tasks === 'object' ? projection.tasks : {};

	for (const [taskId, rawBlock] of Object.entries(rawTasks)) {
		if (!rawBlock || typeof rawBlock !== 'object') continue;
		tasks[taskId] = {
			output: typeof rawBlock.output === 'string' ? rawBlock.output : '',
			thinking: typeof rawBlock.thinking === 'string' ? rawBlock.thinking : '',
		};
	}

	return {
		output: typeof projection?.output === 'string' ? projection.output : '',
		thinking: typeof projection?.thinking === 'string' ? projection.thinking : '',
		tasks,
	};
}

export function buildProjectionFromEntries(
	entries: ConversationEntryLike[]
): NormalizedStreamProjection {
	const projection: NormalizedStreamProjection = {
		output: '',
		thinking: '',
		tasks: {},
	};

	const append = (kind: 'output' | 'thinking', text: string, taskId?: string | null): void => {
		if (!text) return;
		if (taskId) {
			if (!projection.tasks[taskId]) {
				projection.tasks[taskId] = { output: '', thinking: '' };
			}
			projection.tasks[taskId]![kind] += text;
			return;
		}
		projection[kind] += text;
	};

	for (const entry of entries) {
		const type = typeof entry.type === 'string' ? entry.type : '';
		if (type === 'tool_call') {
			const toolName = typeof entry.toolName === 'string' ? entry.toolName : 'tool';
			append('output', `[tool_call] ${toolName}\n\n`, entry.taskId);
			continue;
		}

		const content = typeof entry.content === 'string' ? entry.content : '';
		const thinking = typeof entry.thinking === 'string' ? entry.thinking : '';
		if (type === 'message') {
			if (thinking) {
				append('thinking', `${thinking}\n\n`, entry.taskId);
			}
			if (!content) continue;
			append('output', `${content}\n\n`, entry.taskId);
			continue;
		}
		if (!content) continue;

		if (type === 'tool_result' || type === 'task_result') {
			append('output', `${content}\n\n`, entry.taskId);
			continue;
		}

		if (type === 'thinking') {
			append('thinking', `${content}\n\n`, entry.taskId);
		}
	}

	return projection;
}

export function shouldReplaceStreamProjection(
	currentSource: StreamProjectionSource,
	nextSource: Exclude<StreamProjectionSource, 'live'>
): boolean {
	if (nextSource === 'snapshot') {
		return currentSource === 'none' || currentSource === 'snapshot';
	}

	if (nextSource === 'replay') {
		return currentSource === 'none' || currentSource === 'snapshot' || currentSource === 'replay';
	}

	if (nextSource === 'hydration') {
		return currentSource !== 'live';
	}

	return false;
}
