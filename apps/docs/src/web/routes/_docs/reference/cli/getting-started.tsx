import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/getting-started')({
	component: () => (
		<PlaceholderPage title="CLI: Getting Started" description="Install and configure the CLI." />
	),
	staticData: { crumb: 'Getting Started' },
});
