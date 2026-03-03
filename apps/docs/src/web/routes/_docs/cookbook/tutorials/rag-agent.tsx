import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/cookbook/tutorials/rag-agent')({
	component: () => <MDXPage route="cookbook/tutorials/rag-agent" />,
	staticData: { crumb: 'RAG Agent' },
});
