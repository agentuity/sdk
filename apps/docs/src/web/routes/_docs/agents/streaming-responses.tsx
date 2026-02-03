import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/streaming-responses')({
	component: () => (
		<PlaceholderPage
			title="Streaming Responses"
			description="Stream responses from agents to clients."
		/>
	),
	staticData: { crumb: 'Streaming Responses' },
});
