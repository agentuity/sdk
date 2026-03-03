import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/agents/ai-gateway')({
	component: () => <MDXPage route="agents/ai-gateway" />,
	staticData: { crumb: 'AI Gateway' },
});
