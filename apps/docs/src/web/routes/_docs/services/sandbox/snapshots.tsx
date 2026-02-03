import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/sandbox/snapshots')({
	component: () => (
		<PlaceholderPage title="Snapshots" description="Save and restore sandbox state." />
	),
	staticData: { crumb: 'Snapshots' },
});
