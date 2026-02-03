import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/storage/key-value')({
	component: () => (
		<PlaceholderPage title="Key-Value Storage" description="Store and retrieve data by key." />
	),
	staticData: { crumb: 'Key-Value' },
});
