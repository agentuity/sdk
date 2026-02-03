import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/storage/')({
	component: () => (
		<PlaceholderPage title="Storage" description="Key-value, vector, object, and database storage." />
	),
	staticData: { crumb: 'Storage' },
});
