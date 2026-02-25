import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';

import type { PromptType } from './types';

// Zod schema for AI SDK compatibility (separate from @agentuity/schema)
const PromptClassificationSchemaZod = z.object({
	type: z.enum(['Normal', 'Thinking']),
	confidence: z.number(),
	reasoning: z.string(),
});

export async function rephraseVaguePrompt(
	ctx: any,
	input: string
): Promise<string> {
	const systemPrompt = `You are a technical documentation search assistant for developer tools and AI agents. Your job is to CAREFULLY improve unclear queries ONLY when absolutely necessary.

BE EXTREMELY CONSERVATIVE. Most queries should be returned UNCHANGED.

ONLY rephrase if the query contains:
1. OBVIOUS acronyms that need expansion (SDK, API, CLI, UI, KV, HTTP, REST, JSON, XML)
2. Very vague single words like "error", "setup", "install" without context

NEVER change or "correct" these technical terms (return them exactly as written):
- bun, node, deno (JavaScript runtimes)
- react, vue, angular, svelte (frameworks)
- typescript, javascript, python, rust (languages)
- docker, kubernetes, aws, gcp (platforms)
- Any proper nouns or brand names

When rephrasing:
- Keep the original technical terms EXACTLY as written
- Only add minimal context for clarity
- Don't assume what the user meant
- Don't add implementation details

Examples of GOOD rephrasing:
- "SDK setup" → "SDK setup installation configuration"
- "API error" → "API error handling troubleshooting"
- "CLI install" → "CLI installation setup"

Examples of what to LEAVE UNCHANGED:
- "bun example agent" → "bun example agent" (bun is a known runtime)
- "react component" → "react component" (already clear)
- "node server setup" → "node server setup" (already specific enough)
- "typescript agent" → "typescript agent" (clear technical terms)

If in doubt, return the query UNCHANGED. Better to leave it as-is than to misinterpret the user's intent.

Return ONLY the query text, nothing else.`;

	try {
		const result = await generateText({
			model: openai('gpt-4o-mini'),
			system: systemPrompt,
			prompt: `User query: "${input}"`,
			temperature: 0.1,
		});

		const rephrasedQuery = result.text?.trim() || input;
		// Log if we actually rephrased it
		if (rephrasedQuery !== input) {
			ctx.logger.info(
				'Rephrased query from "%s" to "%s"',
				input,
				rephrasedQuery
			);
		}

		return rephrasedQuery;
	} catch (error) {
		ctx.logger.error('Error rephrasing prompt, returning original: %o', error);
		return input;
	}
}

/**
 * Determines the prompt type based on the input string using LLM classification.
 * Uses specific, measurable criteria to decide between Normal and Agentic RAG.
 * @param ctx - Agent Context for logging and LLM access
 * @param input - The input string to analyze
 * @returns {Promise<PromptType>} - The determined PromptType
 */
export async function getPromptType(
	ctx: any,
	input: string
): Promise<PromptType> {
	const systemPrompt = `
You are a query classifier that determines whether a user question requires simple retrieval (Normal) or complex reasoning (Thinking).

Use these SPECIFIC criteria for classification:

**THINKING (Agentic RAG) indicators:**
- Multi-step reasoning required (e.g., "compare and contrast", "analyze pros/cons")
- Synthesis across multiple concepts (e.g., "how does X relate to Y")
- Scenario analysis (e.g., "what would happen if...", "when should I use...")
- Troubleshooting/debugging questions requiring logical deduction
- Questions with explicit reasoning requests ("explain why", "walk me through")
- Comparative analysis ("which is better for...", "what are the trade-offs")

**NORMAL (Simple RAG) indicators:**
- Direct factual lookups (e.g., "what is...", "how do I install...")
- Simple how-to questions with clear answers
- API reference queries
- Configuration/syntax questions
- Single-concept definitions

Respond with a JSON object containing:
- type: "Normal" or "Thinking"
- confidence: 0.0-1.0 (how certain you are)
- reasoning: brief explanation of your classification

Be conservative - when in doubt, default to "Normal" for better performance.`;

	try {
		const result = await generateObject({
			model: openai('gpt-4o-mini'), // Use faster model for classification
			system: systemPrompt,
			prompt: `Classify this user query: "${input}"`,
			schema: PromptClassificationSchemaZod,
		});

		const classification = result.object as z.infer<typeof PromptClassificationSchemaZod>;
		ctx.logger.info(
			'Prompt classified as %s (confidence: %f): %s',
			classification.type,
			classification.confidence,
			classification.reasoning
		);

		return classification.type as PromptType;
	} catch (error) {
		ctx.logger.error(
			'Error classifying prompt, defaulting to Normal: %o',
			error
		);
		return 'Normal' as PromptType;
	}
}
