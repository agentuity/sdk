import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

enum TransformType {
	Uppercase = 'uppercase',
	Lowercase = 'lowercase',
	Capitalize = 'capitalize',
	Reverse = 'reverse',
}

type TransformResult = {
	original: string;
	transformed: string;
	type: TransformType;
};

const helperAgent = createAgent('utils-string-helper', {
	schema: {
		input: s.object({
			text: s.string(),
			transform: s.string(),
		}),
		output: s.object({
			result: s.string(),
			metadata: s.any().optional(),
		}),
	},
	handler: async (ctx, input) => {
		let transformed: string;
		let type: TransformType;

		switch (input.transform) {
			case 'uppercase':
				transformed = input.text.toUpperCase();
				type = TransformType.Uppercase;
				break;
			case 'lowercase':
				transformed = input.text.toLowerCase();
				type = TransformType.Lowercase;
				break;
			case 'capitalize':
				transformed = input.text.charAt(0).toUpperCase() + input.text.slice(1).toLowerCase();
				type = TransformType.Capitalize;
				break;
			case 'reverse':
				transformed = input.text.split('').reverse().join('');
				type = TransformType.Reverse;
				break;
			default:
				transformed = input.text;
				type = TransformType.Uppercase;
		}

		const metadata: TransformResult = {
			original: input.text,
			transformed,
			type,
		};

		return {
			result: transformed,
			metadata,
		};
	},
});

export default helperAgent;
