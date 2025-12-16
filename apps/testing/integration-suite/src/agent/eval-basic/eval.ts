import { politenessEval } from '@agentuity/evals';
import evalsBasicAgent, { AgentOutput, AgentInput } from './basic';

// export const createEval1 = evalsBasicAgent.createEval(politenessEval({  }));

export const createEval = evalsBasicAgent.createEval(
	politenessEval<typeof AgentInput, typeof AgentOutput>({
		name: 'my-politeness',
		model: 'gpt-6.7',
		// 		howPolite: 'somewhat',
		middleware: {
			transformInput: (input) => ({ value: String(input.value) }),
			transformOutput: (output) => ({ result: String(output.result) }),
		},
	})
);
