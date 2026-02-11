import { tool } from 'ai';
import { z } from 'zod';
import { getTutorialMeta } from './tutorial';
import docQAAgent from '@agent/doc_qa';
import type { Action } from './types';
import { ActionType } from './types';

interface ToolState {
	action: Action | null;
}

/**
 * Factory function that creates tools with state management context
 */
export async function createTools(state: ToolState, agentContext: any) {
	/**
	 * Tool for starting a tutorial - adds action to state queue
	 */
	const startTutorialAtStep = tool({
		description:
			'Start a specific tutorial for the user. You must call this function in order for the user to see the tutorial step content. The tutorial content will be injected to the final response automatically -- you do not have to narrate the tutorial content. The step number should be between 1 and the total number of steps in the tutorial.',
		inputSchema: z.object({
			tutorialId: z.string().describe('The exact ID of the tutorial to start'),
			stepNumber: z.number().describe('The step number of the tutorial to start (1 to total available steps in the tutorial)'),
		}),
		execute: async ({ tutorialId, stepNumber }) => {
			// Validate tutorial exists before starting
			const tutorialResponse = await getTutorialMeta(tutorialId, agentContext);
			if (!tutorialResponse.success || !tutorialResponse.data) {
				return `Error fetching tutorial information`;
			}

			const data = tutorialResponse.data;
			const totalSteps = tutorialResponse.data.totalSteps;
			if (stepNumber > totalSteps) {
				return `This tutorial only has ${totalSteps} steps. You either reached the end of the tutorial or selected an incorrect step number.`;
			}
			state.action = {
				type: ActionType.START_TUTORIAL_STEP,
				tutorialId: tutorialId,
				currentStep: stepNumber,
				totalSteps: tutorialResponse.data.totalSteps,
			};
			return `Starting "${data.title}". Total steps: ${data.totalSteps} \n\n Description: ${data.description}`;
		},
	});

	/**
	 * Tool that talks to docs agent.
	 * This tool doesn't use state - it returns data directly
	 */
	const askDocsAgentTool = tool({
		description:
			'Query the Agentuity Development Documentation agent using RAG (Retrieval Augmented Generation) to get relevant documentation and answers about the Agentuity platform, APIs, and development concepts',
		inputSchema: z.object({
			query: z.string().describe('The question or query to send to the query function'),
		}),
		execute: async ({ query }) => {
			try {
				const response = await docQAAgent.run({
					message: query,
				});
				return response;
			} catch (error) {
				agentContext.logger.error('Error calling doc-qa agent: %s', error);
				return { answer: 'Failed to retrieve documentation', documents: [] as { url: string; title: string }[] };
			}
		},
	});

	// Return tools object
	return {
		startTutorialAtStep,
		askDocsAgentTool,
	};
}
