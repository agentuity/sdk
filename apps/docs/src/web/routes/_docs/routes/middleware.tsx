import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/routes/middleware')({
	component: () => (
		<PlaceholderPage title="Middleware" description="Add middleware for authentication, logging, and more." />
	),
	staticData: { crumb: 'Middleware' },
});
