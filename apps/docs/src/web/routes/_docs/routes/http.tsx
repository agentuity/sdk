import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/routes/http')({
	component: () => (
		<PlaceholderPage title="HTTP Routes" description="Create HTTP endpoints with the Hono router." />
	),
	staticData: { crumb: 'HTTP' },
});
