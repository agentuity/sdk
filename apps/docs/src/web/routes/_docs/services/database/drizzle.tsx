import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/database/drizzle')({
	component: () => (
		<PlaceholderPage title="Drizzle" description="Use Drizzle ORM with your Agentuity agents." />
	),
	staticData: { crumb: 'Drizzle' },
});
