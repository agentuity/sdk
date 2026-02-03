import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/calling-other-agents')({
	component: () => (
		<PlaceholderPage
			title="Calling Other Agents"
			description="Invoke agents from other agents or routes."
		/>
	),
	staticData: { crumb: 'Calling Other Agents' },
});
