import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/agents/streaming-responses')({
	component: () => <MDXPage route="agents/streaming-responses" />,
	staticData: { crumb: 'Streaming Responses' },
});
