import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { rephraseVaguePrompt } from './prompt';
import { retrieveRelevantDocs } from './retriever';
import type { Answer } from './types';

// Zod schema for AI SDK compatibility
const DocumentReferenceSchemaZod = z.object({
	url: z.string(),
	title: z.string(),
});

const AnswerSchemaZod = z.object({
	answer: z.string(),
	documents: z.array(DocumentReferenceSchemaZod),
});

export default async function answerQuestion(
	ctx: any,
	prompt: string
): Promise<Answer> {
	// First, rephrase the prompt for better vector search
	const rephrasedPrompt = await rephraseVaguePrompt(ctx, prompt);

	// Use the rephrased prompt for document retrieval
	const relevantDocs = await retrieveRelevantDocs(ctx, rephrasedPrompt);

	const systemPrompt = `
You are Agentuity's developer-documentation assistant.

=== CONTEXT ===
Your role is to be as helpful as possible and try to assist user by answering their questions.

=== RULES ===
1. Use ONLY the content inside <DOCS> tags to craft your reply. If the required information is missing, state that the docs do not cover it.
2. Never fabricate or guess undocumented details.
3. Focus on answering the QUESTION with the available <DOCS> provided to you. Keep in mind some <DOCS> might not be relevant, so pick the ones that is relevant to the user's question.
4. Ambiguity handling:
   • When <DOCS> contains more than one distinct workflow or context that could satisfy the question, do **not** choose for the user.
   • Briefly (≤ 2 sentences each) summarise each plausible interpretation and ask **one** clarifying question so the user can pick a path.
   • Provide a definitive answer only after the ambiguity is resolved.
5. Answer style:
   • If the question can be answered unambiguously from a single workflow, give a short, direct answer.
   • Add an explanation only when the user explicitly asks for one.
   • Format your response in **MDX (Markdown Extended)** format with proper syntax highlighting for code blocks.
   • Use appropriate headings (##, ###) to structure longer responses.
   • Wrap CLI commands in \`\`\`bash code blocks for proper syntax highlighting.
   • Wrap code snippets in appropriate language blocks (e.g., \`\`\`typescript, \`\`\`json, \`\`\`javascript).
   • Use **bold** for important terms and *italic* for emphasis when appropriate.
   • Use > blockquotes for important notes or warnings.
6. You may suggest concise follow-up questions or related topics that are present in <DOCS>.
7. If <DOCS> do not answer the question, state that explicitly and offer the closest documented topic; answer strictly from <DOCS> or ask one clarifying question if nothing related exists.
8. Keep a neutral, factual tone.
=== OUTPUT FORMAT ===
Return **valid JSON only** matching this TypeScript type:

type DocumentReference = {
  url: string;     // Path with optional heading anchor
  title: string;   // Human-readable title for the document
}

type LlmAnswer = {
  answer: string;              // The reply in MDX format or the clarifying question
  documents: DocumentReference[];   // Documents actually cited
}

The "answer" field should contain properly formatted MDX content that will render beautifully in a documentation site.
The "documents" field must contain references to the documents you used to answer the question:
- "url": The path to the document. You may include a specific heading anchor to link to the exact section. Format: append the heading using a hash symbol (#) followed by the heading text, replacing spaces with hyphens (-) and converting to lowercase. Example: "/docs/guide#getting-started"
- "title": Use the document's title from the <DOCS> content. Each document in <DOCS> has a "title" field - use that exact value. If citing a specific section, you may append the section name in parentheses, e.g. "Getting Started (Quickstart Guide)"
If you cited no documents, return an empty array. Do NOT wrap the JSON in Markdown or add any extra keys.

=== MDX FORMATTING EXAMPLES ===
For CLI commands:
\`\`\`bash
agentuity agent create my-agent "My agent description" bearer
\`\`\`

For code examples:
\`\`\`typescript
import type { AgentRequest, AgentResponse, AgentContext } from "@agentuity/sdk";

export default async function Agent(req: AgentRequest, resp: AgentResponse, ctx: AgentContext) {
    return resp.json({hello: 'world'});
}
\`\`\`

For structured responses:
## Creating a New Agent

To create a new agent, use the CLI command:

\`\`\`bash
agentuity agent create [name] [description] [auth_type]
\`\`\`

**Parameters:**
- \`name\`: The agent name
- \`description\`: Agent description
- \`auth_type\`: Either \`bearer\` or \`none\`

> **Note**: This command will create the agent in the Agentuity Cloud and set up local files.

<USER_QUESTION>
${rephrasedPrompt}
</USER_QUESTION>

<DOCS>
${JSON.stringify(relevantDocs, null, 2)}
</DOCS>
`;

	try {
		const result = await generateObject({
			model: openai('gpt-4o'),
			system: systemPrompt,
			prompt: 'The user is mostly a software engineer. Your answer should be concise, straightforward and in most cases, supplying the answer with examples code snipped is ideal.',
			schema: AnswerSchemaZod,
		});
		return result.object as Answer;
	} catch (error) {
		ctx.logger.error('Error generating answer: %o', error);

		// Fallback response with MDX formatting
		const fallbackAnswer: Answer = {
			answer: `## Error

I apologize, but I encountered an error while processing your question.

**Please try:**
- Rephrasing your question
- Being more specific about what you're looking for
- Checking if your question relates to Agentuity's documented features

> If the problem persists, please contact support.`,
			documents: [],
		};

		return fallbackAnswer;
	}
}
