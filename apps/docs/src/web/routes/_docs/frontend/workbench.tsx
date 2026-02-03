import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/frontend/workbench')({
	component: () => (
		<PlaceholderPage title="Frontend Workbench" description="Embed the workbench in your application." />
	),
	staticData: { crumb: 'Workbench' },
});
