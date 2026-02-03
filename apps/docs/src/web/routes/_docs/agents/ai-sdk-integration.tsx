import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/ai-sdk-integration')({
	component: () => (
		<PlaceholderPage
			title="AI SDK Integration"
			description="Integrate with the Vercel AI SDK for streaming and structured output."
		/>
	),
	staticData: { crumb: 'AI SDK Integration' },
});
