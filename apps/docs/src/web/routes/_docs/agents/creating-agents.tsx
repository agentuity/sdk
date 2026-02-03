import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/creating-agents')({
	component: () => (
		<PlaceholderPage
			title="Creating Agents"
			description="Learn how to create agents with schemas and handlers."
		/>
	),
	staticData: { crumb: 'Creating Agents' },
});
