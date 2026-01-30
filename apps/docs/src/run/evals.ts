/**
 * Standalone invoke script for Evals Demo
 *
 * Demonstrates: Running evaluations on agent output
 * Shows both a preset-style eval (completeness) and custom eval (factual claims)
 *
 * Usage: bun run src/run/evals.ts '{"question":"What is TypeScript?"}'
 */
import { createAgentContext } from '@agentuity/runtime';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import agentuityDocs from '../agent/chat/agentuity-context.txt';

interface Input {
	question?: string;
}

// Schemas for structured eval output
const CompletenessSchema = z.object({
	score: z.number().min(0).max(1).describe('How completely the response addresses the question (0-1)'),
	reason: z.string().describe('Brief explanation of the score'),
});

const FactualClaimsSchema = z.object({
	containsFactualClaims: z.boolean().describe('Whether the text contains factual claims'),
	reason: z.string().describe('Brief explanation'),
});

const input: Input = JSON.parse(process.argv[2] ?? '{}');
const question = input.question ?? 'What is Agentuity and what are its main features?';

const ctx = createAgentContext();

ctx.logger.info('Running evals demo');

try {
	// Step 1: Generate the answer (with Agentuity context)
	const { text: answer } = await generateText({
		model: openai('gpt-5-nano'),
		system: `You are an Agentuity expert. Answer questions based on this documentation:

${agentuityDocs}`,
		prompt: question,
	});

	// Truncate answer for eval prompts
	const truncatedAnswer = answer.slice(0, 500);

	// Step 2: Run both evals in PARALLEL with structured output
	const [completenessResult, factualResult] = await Promise.all([
		generateObject({
			model: openai('gpt-5-nano'),
			schema: CompletenessSchema,
			prompt: `Rate how completely this answer addresses the question.

Question: "${question}"
Answer: "${truncatedAnswer}"

Score from 0 (completely misses the point) to 1 (fully addresses all aspects).`,
		}).catch(() => null),
		generateObject({
			model: openai('gpt-5-nano'),
			schema: FactualClaimsSchema,
			prompt: `Does this text contain factual claims (real facts, statistics, actual capabilities, or verifiable information)?

Text to analyze:
"${truncatedAnswer}"`,
		}).catch(() => null),
	]);

	// Extract results with fallbacks
	const completeness = completenessResult?.object ?? { score: 0.75, reason: 'Eval failed' };
	const factual = factualResult?.object ?? { containsFactualClaims: true, reason: 'Eval failed' };

	console.log('---OUTPUT---');
	console.log(`Question: "${question}"`);
	console.log('');
	console.log(`Answer: "${answer.slice(0, 200)}${answer.length > 200 ? '...' : ''}"`);
	console.log('');
	console.log('Evals:');
	console.log(
		`  answer-completeness: ${(completeness.score * 100).toFixed(0)}% - "${completeness.reason}"`
	);
	console.log(
		`  factual-claims: ${factual.containsFactualClaims ? 'Passed' : 'Failed'} - "${factual.reason}"`
	);
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
