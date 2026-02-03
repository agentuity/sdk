import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/ai-gateway')({
	component: () => (
		<PlaceholderPage
			title="AI Gateway"
			description="Use any AI provider with a single API key."
		/>
	),
	staticData: { crumb: 'AI Gateway' },
});
