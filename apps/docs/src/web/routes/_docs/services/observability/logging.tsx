import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/observability/logging')({
	component: () => (
		<PlaceholderPage title="Logging" description="Structured logging with ctx.logger." />
	),
	staticData: { crumb: 'Logging' },
});
