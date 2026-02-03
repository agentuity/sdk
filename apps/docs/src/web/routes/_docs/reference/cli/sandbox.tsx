import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/sandbox')({
	component: () => (
		<PlaceholderPage title="CLI: Sandbox" description="Manage sandboxes from the CLI." />
	),
	staticData: { crumb: 'Sandbox' },
});
