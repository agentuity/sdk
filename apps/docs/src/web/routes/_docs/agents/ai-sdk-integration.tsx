import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/agents/ai-sdk-integration')({
	component: () => <MDXPage route="agents/ai-sdk-integration" />,
	staticData: { crumb: 'AI SDK Integration' },
});
