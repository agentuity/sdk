import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/observability/')({
	component: () => (
		<PlaceholderPage title="Observability" description="Logging, tracing, and debugging tools." />
	),
	staticData: { crumb: 'Observability' },
});
