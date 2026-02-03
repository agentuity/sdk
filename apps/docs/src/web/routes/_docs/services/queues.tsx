import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/queues')({
	component: () => (
		<PlaceholderPage title="Queues" description="Process background jobs with queues." />
	),
	staticData: { crumb: 'Queues' },
});
