import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/storage/custom')({
	component: () => (
		<PlaceholderPage title="Custom Storage" description="Bring your own storage providers." />
	),
	staticData: { crumb: 'Custom' },
});
