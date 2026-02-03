import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/storage/object')({
	component: () => (
		<PlaceholderPage title="Object Storage" description="Store files with S3-compatible APIs." />
	),
	staticData: { crumb: 'Object' },
});
