import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/state-management')({
	component: () => (
		<PlaceholderPage
			title="State Management"
			description="Manage state across agent requests with thread and request state."
		/>
	),
	staticData: { crumb: 'State Management' },
});
