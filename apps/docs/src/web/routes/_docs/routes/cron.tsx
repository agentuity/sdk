import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/routes/cron')({
	component: () => (
		<PlaceholderPage title="Cron Jobs" description="Schedule tasks with cron expressions." />
	),
	staticData: { crumb: 'Cron' },
});
