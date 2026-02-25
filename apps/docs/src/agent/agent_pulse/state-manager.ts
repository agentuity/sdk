import { ActionType, type Action, type TutorialData } from './types';
import { getTutorialStep } from './tutorial';

/**
 * Handles tutorial state and fetches complete tutorial step data
 * This transforms the action (which only has IDs) into complete TutorialData with content
 */
export async function handleTutorialState(
	state: { action: Action | null },
	ctx: any
): Promise<TutorialData | null> {
	try {
		if (!state.action) {
			return null;
		}

		const action = state.action;

		switch (action.type) {
			case ActionType.START_TUTORIAL_STEP:
				if (action.tutorialId) {
					// Fetch the complete tutorial step content
					const tutorialStep = await getTutorialStep(action.tutorialId, action.currentStep, ctx);

					if (tutorialStep.success && tutorialStep.data) {
						const tutorialData: TutorialData = {
							tutorialId: action.tutorialId,
							totalSteps: action.totalSteps,
							currentStep: action.currentStep,
							tutorialStep: {
								title: tutorialStep.data.tutorialStep.title,
								mdx: tutorialStep.data.tutorialStep.mdx,
								snippets: tutorialStep.data.tutorialStep.snippets,
								totalSteps: tutorialStep.data.tutorialStep.totalSteps,
							},
						};
						return tutorialData;
					} else {
						// Handle API errors gracefully
						ctx.logger.error('Failed to fetch tutorial step: %s', tutorialStep.error || 'Unknown error');
						if (tutorialStep.details) {
							ctx.logger.error('Error details: %s', JSON.stringify(tutorialStep.details));
						}
					}
				}
				break;
			default:
				ctx.logger.warn('Unknown action type: %s', action.type);
		}

		return null;
	} catch (error) {
		ctx.logger.error(
			'Failed to handle tutorial state: %s',
			error instanceof Error ? error.message : String(error)
		);
		throw error;
	}
}
