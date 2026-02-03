import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/debugging')({
	component: () => (
		<PlaceholderPage title="CLI: Debugging" description="Debug applications with the CLI." />
	),
	staticData: { crumb: 'Debugging' },
});
