import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/opencode-plugin')({
	component: () => (
		<PlaceholderPage title="CLI: Opencode Plugin" description="Use the Opencode plugin for enhanced editing." />
	),
	staticData: { crumb: 'Opencode Plugin' },
});
