import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/patterns/llm-as-a-judge')({
	component: () => (
		<PlaceholderPage title="LLM as a Judge" description="Use LLMs to evaluate and score agent responses." />
	),
	staticData: { crumb: 'LLM as a Judge' },
});
