import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/configuration')({
	component: () => (
		<PlaceholderPage title="CLI: Configuration" description="Configure the CLI." />
	),
	staticData: { crumb: 'Configuration' },
});
