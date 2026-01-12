/**
 * Model Arena Prompts
 *
 * System prompts for story generation and LLM judge evaluation.
 */
import { type ModelResult, PROVIDER_DISPLAY_NAMES, type Tone } from './types';

export const WORD_LIMIT = 200;

const TONE_DESCRIPTIONS: Record<Tone, string> = {
	whimsical:
		'whimsical and playful, with a sense of wonder, lightness, and perhaps some magical or fantastical elements',
	'sci-fi':
		'science fiction or futuristic, with technology, space, speculative science, or dystopian/utopian themes',
	suspenseful: 'suspenseful and tense, building dread or anticipation, with thriller-like pacing',
	comedic:
		'comedic and funny, with humor, absurdity, or witty elements that aim to make the reader laugh',
};

export function getStorySystemPrompt(tone: Tone): string {
	return `You are a creative storyteller. Write a short story (maximum ${WORD_LIMIT} words) based on the user's prompt.

Style: ${TONE_DESCRIPTIONS[tone]}

Requirements:
- Stay under ${WORD_LIMIT} words
- Be creative and engaging
- Maintain the requested tone throughout
- Create a complete mini-narrative with a beginning, middle, and end`;
}

export function getJudgePrompt(results: ModelResult[], tone: Tone, prompt: string): string {
	const storiesText = results
		.map(
			(r) => `--- ${PROVIDER_DISPLAY_NAMES[r.provider]} ---
${r.story}
--- END ${PROVIDER_DISPLAY_NAMES[r.provider]} ---`
		)
		.join('\n\n');

	return `You are a literary judge comparing short stories from different AI models.

ORIGINAL PROMPT: "${prompt}"
REQUESTED TONE: ${tone} (${TONE_DESCRIPTIONS[tone]})
WORD LIMIT: ${WORD_LIMIT} words

${storiesText}

SCORING (0.0-1.0 numeric):
- CREATIVITY: Originality, fresh perspective, avoidance of cliches
- ENGAGEMENT: Hook, narrative momentum, readability

CHECKS (pass/fail boolean):
- TONE MATCH: Does it match the "${tone}" tone? (true = matches, false = doesn't match)
- WORD COUNT: Is it under ${WORD_LIMIT} words? (true = under limit, false = over limit)

WINNER SELECTION:
Balance creativity and engagement scores against the checks. Failed checks are significant penalties - a story that fails a check needs notably higher scores to compensate.

Provide scores/checks and brief reason for each provider, then declare an overall winner with reasoning.`;
}
