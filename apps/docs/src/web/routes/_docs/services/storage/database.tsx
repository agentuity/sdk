import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/storage/database')({
	component: () => (
		<PlaceholderPage title="Database" description="Use relational databases with Agentuity." />
	),
	staticData: { crumb: 'Database' },
});
