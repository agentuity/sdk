import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/storage')({
	component: () => (
		<PlaceholderPage title="CLI: Storage" description="Manage storage from the CLI." />
	),
	staticData: { crumb: 'Storage' },
});
