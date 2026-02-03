import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/frontend/authentication')({
	component: () => (
		<PlaceholderPage title="Authentication" description="Add user authentication to your app." />
	),
	staticData: { crumb: 'Authentication' },
});
