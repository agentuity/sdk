import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/tutorials/rag-agent')({
	component: () => (
		<PlaceholderPage title="RAG Agent" description="Build a retrieval-augmented generation agent." />
	),
	staticData: { crumb: 'RAG Agent' },
});
