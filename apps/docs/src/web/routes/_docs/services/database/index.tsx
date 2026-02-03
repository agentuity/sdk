import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/database/')({
	component: () => (
		<PlaceholderPage title="Database" description="Use databases with your Agentuity agents." />
	),
	staticData: { crumb: 'Database' },
});
