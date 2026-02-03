import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/observability/tracing')({
	component: () => (
		<PlaceholderPage title="Tracing" description="Distributed tracing for agent calls." />
	),
	staticData: { crumb: 'Tracing' },
});
