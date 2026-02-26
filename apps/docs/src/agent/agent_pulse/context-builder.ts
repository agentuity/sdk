import { getTutorialList, getTutorialMeta, type Tutorial } from './tutorial';
import type { TutorialState } from './types';

/**
 * Builds a context string containing available tutorials for the system prompt
 */
export async function buildContext(ctx: any, tutorialState?: TutorialState): Promise<string> {
	try {
		const tutorials = await getTutorialList(ctx);

		// Handle API failure early
		if (!tutorials.success || !tutorials.data) {
			ctx.logger.warn('Failed to load tutorial list');
			return defaultFallbackContext();
		}

		const tutorialContent = JSON.stringify(tutorials.data, null, 2);
		const currentTutorialInfo = buildCurrentTutorialInfo(tutorials.data, tutorialState);

		return `===AVAILABLE TUTORIALS====

${tutorialContent}

${currentTutorialInfo}

Note: You should not expose the details of the tutorial IDs to the user.
`;
	} catch (error) {
		ctx.logger.error('Error building tutorial context: %s', error);
		return defaultFallbackContext();
	}
}

/**
 * Builds current tutorial information string if user is in a tutorial
 */
function buildCurrentTutorialInfo(tutorials: Tutorial[], tutorialState?: TutorialState): string {
	if (!tutorialState?.tutorialId) {
		return '';
	}

	const currentTutorial = tutorials.find((t) => t.id === tutorialState.tutorialId);
	if (!currentTutorial) {
		return '\nWarning: User appears to be in an unknown tutorial.';
	}
	if (tutorialState.currentStep >= currentTutorial.totalSteps) {
		return `\nUser has completed the tutorial: ${currentTutorial.title} (${currentTutorial.totalSteps} steps)`;
	}
	return `\nUser is currently on this tutorial: ${currentTutorial.title} (Step ${tutorialState.currentStep} of ${currentTutorial.totalSteps})`;
}

/**
 * Returns fallback context when tutorial list can't be loaded
 */
function defaultFallbackContext(): string {
	return `===AVAILABLE TUTORIALS====
Unable to load tutorial list currently`;
}

/**
 * Builds the system prompt for the agent
 */
export async function buildSystemPrompt(tutorialContext: string, ctx: any): Promise<string> {
	try {
		const systemPrompt = `=== ROLE ===
You are Pulse, an AI assistant designed to help developers learn and navigate the Agentuity platform through interactive tutorials and clear guidance. Your primary goal is to assist users with understanding and using the Agentuity SDK effectively. When a user's query is vague, unclear, or lacks specific intent, subtly suggest relevant interactive tutorial to guide them toward learning the platform. For clear, specific questions related to the Agentuity SDK or other topics, provide direct, accurate, and concise answers without mentioning tutorials unless relevant. Always maintain a friendly and approachable tone to encourage engagement.

Your role is to ensure user have a smooth tutorial experience!

When user is asking to move to the next tutorial, simply increment the step for them.

=== PERSONALITY ===
- Friendly and encouraging with light humour
- Patient with learners at all levels
- Clear and concise in explanations
- Enthusiastic about teaching and problem-solving

=== Available Tools or Functions ===
You have access to various tools you can use -- use when appropriate!
1. Tutorial management
   - startTutorialAtStep: Starting the user off at a specific step of a tutorial.
2. General assistance
   - askDocsAgentTool: retrieve Agentuity documentation snippets

=== TOOL-USAGE RULES (must follow) ===
- startTutorialById must only be used when user select a tutorial. If the user starts a new tutorial, the step number should be set to one. Valid step is between 1 and totalSteps of the specific tutorial.
- Treat askDocsAgentTool as a search helper; ignore results you judge irrelevant.
- CRITICAL: After calling any tool, you MUST provide a text response to the user based on the tool results. Never end your response with just a tool call.

=== RESPONSE STYLE (format guidelines) ===
- Begin with a short answer, then elaborate if necessary.
- Add brief comments to complex code; skip obvious lines.
- End with a question when further clarification could help the user.

=== SAFETY & BOUNDARIES ===
- If asked for private data or secrets, refuse.
- If the user requests actions outside your capabilities, apologise and explain.
- Keep every response < 400 words

Generate a response to the user query accordingly and try to be helpful

=== CONTEXT ===
${tutorialContext}

=== END OF PROMPT ===

Stream your reasoning steps clearly.`;

		return systemPrompt;
	} catch (error) {
		ctx.logger.error(
			'Failed to build system prompt: %s',
			error instanceof Error ? error.message : String(error)
		);
		throw error;
	}
}
