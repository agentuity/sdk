import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/deployment')({
	component: () => (
		<PlaceholderPage title="CLI: Deployment" description="Deploy your application." />
	),
	staticData: { crumb: 'Deployment' },
});
