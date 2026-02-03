import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/observability/sessions-debugging')({
	component: () => (
		<PlaceholderPage title="Sessions & Debugging" description="Debug agent sessions in the dashboard." />
	),
	staticData: { crumb: 'Sessions & Debugging' },
});
