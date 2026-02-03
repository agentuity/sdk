import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/events-lifecycle')({
	component: () => (
		<PlaceholderPage
			title="Events & Lifecycle"
			description="Understand the agent execution lifecycle and events."
		/>
	),
	staticData: { crumb: 'Events & Lifecycle' },
});
