import { defineDemoAgent } from '../demo-agent';
import { s } from '@agentuity/schema';
import answerQuestion from './rag';

const agent = defineDemoAgent('DocQA', {
	description:
		'Documentation Q&A Agent - Answers questions about Agentuity documentation using RAG',
	schema: {
		input: s.object({
			message: s.string(),
		}),
		output: s.object({
			answer: s.string(),
			documents: s.array(
				s.object({
					url: s.string(),
					title: s.string(),
				})
			),
		}),
	},
	handler: async (ctx, input) => {
		const answer = await answerQuestion(ctx, input.message);
		return answer;
	},
});

export default agent;
