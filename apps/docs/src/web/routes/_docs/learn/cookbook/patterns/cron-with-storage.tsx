import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/patterns/cron-with-storage')({
	component: () => (
		<PlaceholderPage title="Cron with Storage" description="Schedule tasks with persistent storage." />
	),
	staticData: { crumb: 'Cron with Storage' },
});
