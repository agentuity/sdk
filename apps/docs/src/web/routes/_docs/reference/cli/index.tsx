import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/')({
	component: () => (
		<PlaceholderPage title="CLI Reference" description="Complete CLI command reference." />
	),
	staticData: { crumb: 'CLI' },
});
