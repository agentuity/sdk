import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/frontend/deployment-scenarios')({
	component: () => (
		<PlaceholderPage title="Deployment Scenarios" description="Deploy frontends with different configurations." />
	),
	staticData: { crumb: 'Deployment Scenarios' },
});
