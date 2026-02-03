import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/development')({
	component: () => (
		<PlaceholderPage title="CLI: Development" description="Development commands and workflows." />
	),
	staticData: { crumb: 'Development' },
});
