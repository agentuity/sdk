import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/storage/durable-streams')({
	component: () => (
		<PlaceholderPage title="Durable Streams" description="Create shareable URLs for generated content." />
	),
	staticData: { crumb: 'Durable Streams' },
});
