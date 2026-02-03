import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/apis/calling-agents')({
	component: () => (
		<PlaceholderPage title="Calling Agents" description="Call agents from external APIs." />
	),
	staticData: { crumb: 'Calling Agents' },
});
