import { expect, test } from 'bun:test';
import { answerDocsQuestion, buildDocsAnswerSystemPrompt } from '../answer';
import type { DocsAssistantContext, RelevantDoc } from '../types';

test('builds a v3-safe Ask AI prompt from docs context', () => {
	const docs: RelevantDoc[] = [
		{
			path: 'build/agents/index.mdx',
			title: 'Agents',
			content:
				'Start with a plain typed function. It accepts validated input, returns typed output, and does not call `createAgent()`.',
			relevanceScore: 0.98,
		},
	];

	const prompt = buildDocsAnswerSystemPrompt('How do I create an agent in v3?', docs);

	expect(prompt).toContain('New v3 apps use framework routes');
	expect(prompt).toContain('bun create agentuity@next my-app');
	expect(prompt).toContain('Start with a plain typed function');
	expect(prompt).toContain('unless the cited docs are explicitly about migration from v2');
	expect(prompt).not.toContain('agentuity agent create');
	expect(prompt).not.toContain('import type { AgentRequest');
});

test('answers through the Ask AI pipeline with v3 docs context', async () => {
	const docs: RelevantDoc[] = [
		{
			path: 'build/agents/index.mdx',
			title: 'Agents',
			content:
				'Agents are plain typed functions in v3. Put model-backed work in the route, queue consumer, schedule, task, webhook, or shared function that owns the trigger.',
			relevanceScore: 0.99,
		},
	];
	const ctx: DocsAssistantContext = {
		logger: {
			debug: () => undefined,
			error: () => undefined,
			info: () => undefined,
			warn: () => undefined,
		},
		vector: {
			async search() {
				return [];
			},
		},
	};

	const answer = await answerDocsQuestion(ctx, 'How do I create an agent in v3?', {
		rephrasePrompt: async (_ctx, input) => input,
		retrieveDocs: async () => docs,
		generateAnswer: async (systemPrompt) => {
			expect(systemPrompt).toContain('Agents are plain typed functions in v3');
			expect(systemPrompt).not.toContain('agentuity agent create');
			return {
				answer:
					'Use a plain typed function in the route, queue consumer, schedule, task, webhook, or shared function that owns the trigger.',
				documents: [{ url: 'build/agents/index.mdx', title: 'Agents' }],
			};
		},
	});

	expect(answer.answer).toContain('plain typed function');
	expect(answer.answer).not.toContain('agentuity agent create');
	expect(answer.documents).toEqual([{ url: 'build/agents/index.mdx', title: 'Agents' }]);
});
