import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/database/postgres')({
	component: () => (
		<PlaceholderPage title="Postgres" description="Connect to Postgres databases from your agents." />
	),
	staticData: { crumb: 'Postgres' },
});
