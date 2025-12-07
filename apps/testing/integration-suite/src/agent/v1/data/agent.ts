import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

interface DataRecord {
	id: string;
	value: string;
	timestamp: number;
}

const dataAgent = createAgent('v1-data-processor', {
	schema: {
		input: s.object({
			operation: s.string(),
			data: s.any().optional(),
		}),
		output: s.object({
			success: s.boolean(),
			result: s.any().optional(),
		}),
	},
	handler: async (ctx, input) => {
		switch (input.operation) {
			case 'create': {
				const record: DataRecord = {
					id: `rec_${Date.now()}`,
					value: input.data || '',
					timestamp: Date.now(),
				};
				return { success: true, result: record };
			}

			case 'process': {
				return {
					success: true,
					result: {
						processed: true,
						data: input.data,
					},
				};
			}

			default:
				return { success: false };
		}
	},
});

export default dataAgent;
