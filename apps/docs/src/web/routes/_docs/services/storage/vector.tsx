import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/storage/vector')({
	component: () => (
		<PlaceholderPage title="Vector Storage" description="Semantic search with embeddings." />
	),
	staticData: { crumb: 'Vector' },
});
