import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/patterns/server-utilities')({
	component: () => (
		<PlaceholderPage title="Server Utilities" description="Useful server-side utilities for agents." />
	),
	staticData: { crumb: 'Server Utilities' },
});
